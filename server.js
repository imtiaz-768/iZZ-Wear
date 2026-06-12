require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "izz_store";
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";

let db;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const collections = {
  users: () => db.collection("users"),
  products: () => db.collection("products"),
  carts: () => db.collection("carts"),
  orders: () => db.collection("orders"),
  settings: () => db.collection("settings"),
  inventory: () => db.collection("inventory_movements"),
};

function toId(id) {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role || "customer",
  };
}

function signUser(user) {
  return jwt.sign(publicUser(user), JWT_SECRET, { expiresIn: "7d" });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Login required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await collections.users().findOne({ _id: toId(decoded.id) });
    if (!user) return res.status(401).json({ message: "User not found" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid session" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function productShape(body) {
  return {
    name: String(body.name || "").trim(),
    category: String(body.category || "Uncategorized").trim(),
    description: String(body.description || "").trim(),
    imageUrl: String(body.imageUrl || "").trim(),
    badge: String(body.badge || "").trim(),
    price: Number(body.price || 0),
    oldPrice: body.oldPrice ? Number(body.oldPrice) : null,
    stock: Number(body.stock || 0),
    active: body.active !== false,
    updatedAt: new Date(),
  };
}

async function cartWithProducts(userId) {
  const cart = await collections.carts().findOne({ userId: userId.toString() });
  const items = cart?.items || [];
  const ids = items.map((item) => toId(item.productId)).filter(Boolean);
  const products = ids.length
    ? await collections.products().find({ _id: { $in: ids } }).toArray()
    : [];
  const byId = new Map(products.map((product) => [product._id.toString(), product]));

  const hydrated = items
    .map((item) => {
      const product = byId.get(item.productId);
      if (!product || product.active === false) return null;
      const quantity = Math.max(1, Number(item.quantity || 1));
      return {
        productId: item.productId,
        quantity,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        stock: product.stock,
        lineTotal: product.price * quantity,
      };
    })
    .filter(Boolean);

  return {
    items: hydrated,
    total: hydrated.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "iZZ API" });
});

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const phone = String(req.body.phone || "").trim();

  if (!name || !email || password.length < 6) {
    return res.status(400).json({ message: "Name, email, and a 6+ character password are required" });
  }

  const existing = await collections.users().findOne({ email });
  if (existing) return res.status(409).json({ message: "Email already registered" });

  const count = await collections.users().countDocuments();
  const user = {
    name,
    email,
    phone,
    passwordHash: await bcrypt.hash(password, 10),
    role: count === 0 ? "admin" : "customer",
    createdAt: new Date(),
  };
  const result = await collections.users().insertOne(user);
  user._id = result.insertedId;

  res.status(201).json({ user: publicUser(user), token: signUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await collections.users().findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  res.json({ user: publicUser(user), token: signUser(user) });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get("/api/products", async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const filter = includeInactive ? {} : { active: { $ne: false } };
  const products = await collections.products().find(filter).sort({ createdAt: -1 }).toArray();
  res.json(products.map((product) => ({ ...product, id: product._id.toString(), _id: undefined })));
});

app.post("/api/products", auth, adminOnly, async (req, res) => {
  const product = { ...productShape(req.body), createdAt: new Date() };
  if (!product.name || product.price <= 0) {
    return res.status(400).json({ message: "Product name and price are required" });
  }
  const result = await collections.products().insertOne(product);
  await collections.inventory().insertOne({
    productId: result.insertedId.toString(),
    change: product.stock,
    reason: "Initial stock",
    createdAt: new Date(),
    adminId: req.user._id.toString(),
  });
  res.status(201).json({ ...product, id: result.insertedId.toString() });
});

app.put("/api/products/:id", auth, adminOnly, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid product id" });
  const before = await collections.products().findOne({ _id: id });
  if (!before) return res.status(404).json({ message: "Product not found" });

  const update = productShape(req.body);
  await collections.products().updateOne({ _id: id }, { $set: update });
  if (Number(before.stock) !== update.stock) {
    await collections.inventory().insertOne({
      productId: id.toString(),
      change: update.stock - Number(before.stock || 0),
      reason: "Admin stock update",
      createdAt: new Date(),
      adminId: req.user._id.toString(),
    });
  }
  res.json({ ...before, ...update, id: id.toString(), _id: undefined });
});

app.delete("/api/products/:id", auth, adminOnly, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid product id" });
  await collections.products().updateOne({ _id: id }, { $set: { active: false, updatedAt: new Date() } });
  res.json({ ok: true });
});

app.get("/api/cart", auth, async (req, res) => {
  res.json(await cartWithProducts(req.user._id));
});

app.post("/api/cart/items", auth, async (req, res) => {
  const productId = String(req.body.productId || "");
  const quantity = Math.max(1, Number(req.body.quantity || 1));
  const product = await collections.products().findOne({ _id: toId(productId), active: { $ne: false } });
  if (!product) return res.status(404).json({ message: "Product not found" });
  const existingCart = await collections.carts().findOne({ userId: req.user._id.toString() });
  const existingItem = existingCart?.items?.find((item) => item.productId === productId);
  const nextQuantity = Number(existingItem?.quantity || 0) + quantity;
  if (product.stock < nextQuantity) return res.status(400).json({ message: "Not enough stock available" });

  await collections.carts().updateOne(
    { userId: req.user._id.toString(), "items.productId": productId },
    { $inc: { "items.$.quantity": quantity }, $set: { updatedAt: new Date() } }
  );
  const cart = await collections.carts().findOne({ userId: req.user._id.toString(), "items.productId": productId });
  if (!cart) {
    await collections.carts().updateOne(
      { userId: req.user._id.toString() },
      { $push: { items: { productId, quantity } }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );
  }
  res.json(await cartWithProducts(req.user._id));
});

app.put("/api/cart/items/:productId", auth, async (req, res) => {
  const quantity = Math.max(0, Number(req.body.quantity || 0));
  const productId = String(req.params.productId);
  if (quantity === 0) {
    await collections.carts().updateOne(
      { userId: req.user._id.toString() },
      { $pull: { items: { productId } }, $set: { updatedAt: new Date() } }
    );
  } else {
    await collections.carts().updateOne(
      { userId: req.user._id.toString(), "items.productId": productId },
      { $set: { "items.$.quantity": quantity, updatedAt: new Date() } }
    );
  }
  res.json(await cartWithProducts(req.user._id));
});

app.post("/api/orders", auth, async (req, res) => {
  const cart = await cartWithProducts(req.user._id);
  if (!cart.items.length) return res.status(400).json({ message: "Cart is empty" });

  for (const item of cart.items) {
    if (item.quantity > item.stock) {
      return res.status(400).json({ message: `${item.name} has only ${item.stock} in stock` });
    }
  }

  const paymentMethod = String(req.body.paymentMethod || "").toLowerCase();
  if (!["bkash", "nagad", "upay", "cod"].includes(paymentMethod)) {
    return res.status(400).json({ message: "Choose bKash, Nagad, Upay, or Cash on Delivery" });
  }

  const order = {
    userId: req.user._id.toString(),
    customer: publicUser(req.user),
    items: cart.items,
    total: cart.total,
    paymentMethod,
    paymentStatus: paymentMethod === "cod" ? "cash_on_delivery" : "pending",
    paymentReference: req.body.paymentReference || null,
    status: "placed",
    shippingAddress: req.body.shippingAddress || {},
    trackingNumber: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collections.orders().insertOne(order);
  for (const item of cart.items) {
    await collections.products().updateOne({ _id: toId(item.productId) }, { $inc: { stock: -item.quantity } });
    await collections.inventory().insertOne({
      productId: item.productId,
      change: -item.quantity,
      reason: `Order ${result.insertedId.toString()}`,
      createdAt: new Date(),
      orderId: result.insertedId.toString(),
    });
  }
  await collections.carts().deleteOne({ userId: req.user._id.toString() });
  res.status(201).json({ ...order, id: result.insertedId.toString() });
});

app.get("/api/orders", auth, async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { userId: req.user._id.toString() };
  const orders = await collections.orders().find(filter).sort({ createdAt: -1 }).toArray();
  res.json(orders.map((order) => ({ ...order, id: order._id.toString(), _id: undefined })));
});

app.put("/api/orders/:id", auth, adminOnly, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid order id" });
  const update = {
    status: req.body.status,
    paymentStatus: req.body.paymentStatus,
    trackingNumber: req.body.trackingNumber || "",
    updatedAt: new Date(),
  };
  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
  await collections.orders().updateOne({ _id: id }, { $set: update });
  res.json({ ok: true });
});

app.post("/api/payments/initiate", auth, async (req, res) => {
  const provider = String(req.body.provider || "").toLowerCase();
  const amount = Number(req.body.amount || 0);
  if (!["bkash", "nagad", "upay"].includes(provider)) {
    return res.status(400).json({ message: "Unsupported payment provider" });
  }
  if (amount <= 0) return res.status(400).json({ message: "Amount is required" });

  res.json({
    provider,
    status: "sandbox_placeholder",
    reference: `${provider.toUpperCase()}-${Date.now()}`,
    message: "Add merchant credentials and provider endpoint details in .env to enable live checkout.",
  });
});

app.get("/api/settings", async (req, res) => {
  const settings = await collections.settings().findOne({ key: "site" });
  res.json(settings?.value || defaultSettings());
});

app.put("/api/settings", auth, adminOnly, async (req, res) => {
  const value = {
    brandName: req.body.brandName || "iZZ",
    heroEyebrow: req.body.heroEyebrow || "",
    heroTitle: req.body.heroTitle || "",
    freeDeliveryText: req.body.freeDeliveryText || "",
    facebook: req.body.facebook || "",
    instagram: req.body.instagram || "",
    tiktok: req.body.tiktok || "",
    whatsapp: req.body.whatsapp || "",
    updatedAt: new Date(),
  };
  await collections.settings().updateOne({ key: "site" }, { $set: { value } }, { upsert: true });
  res.json(value);
});

function defaultSettings() {
  return {
    brandName: "iZZ",
    heroEyebrow: "New Collection - 2026",
    heroTitle: "Wear the Difference.",
    freeDeliveryText: "Free Delivery Over Tk 1500",
    facebook: "#",
    instagram: "#",
    tiktok: "#",
    whatsapp: "#",
  };
}

async function ensureData() {
  await collections.users().createIndex({ email: 1 }, { unique: true });
  await collections.products().createIndex({ name: "text", category: "text" });
  const settings = await collections.settings().findOne({ key: "site" });
  if (!settings) await collections.settings().insertOne({ key: "site", value: defaultSettings() });
}

async function start() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  await ensureData();
  app.listen(PORT, () => {
    console.log(`iZZ store running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start iZZ store", error);
  process.exit(1);
});
