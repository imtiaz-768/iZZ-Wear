require("dotenv").config();

const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "izz_store";

const products = [
  {
    name: "Classic Linen Shirt",
    category: "Shirts",
    description: "Lightweight linen-blend shirt for clean everyday style.",
    imageUrl: "",
    badge: "New",
    price: 1250,
    oldPrice: null,
    stock: 24,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Essential Crew Tee",
    category: "T-Shirts",
    description: "Soft cotton crew tee with a relaxed daily fit.",
    imageUrl: "",
    badge: "Sale",
    price: 550,
    oldPrice: 750,
    stock: 45,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Slim Chino Pants",
    category: "Pants",
    description: "Tapered chino pants with comfortable stretch.",
    imageUrl: "",
    badge: "New",
    price: 1650,
    oldPrice: null,
    stock: 18,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Oxford Button-Down",
    category: "Shirts",
    description: "Structured oxford shirt for office and weekend wear.",
    imageUrl: "",
    badge: "",
    price: 1400,
    oldPrice: null,
    stock: 20,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Graphic Print Tee",
    category: "T-Shirts",
    description: "Statement print tee with durable screen printing.",
    imageUrl: "",
    badge: "Popular",
    price: 680,
    oldPrice: null,
    stock: 32,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Cargo Jogger Pants",
    category: "Pants",
    description: "Utility jogger with cargo pockets and ankle cuffs.",
    imageUrl: "",
    badge: "Sale",
    price: 1100,
    oldPrice: 1500,
    stock: 14,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

async function seed() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const count = await db.collection("products").countDocuments();
  if (count === 0) {
    await db.collection("products").insertMany(products);
    console.log(`Seeded ${products.length} products.`);
  } else {
    console.log("Products already exist; seed skipped.");
  }
  await db.collection("settings").updateOne(
    { key: "site" },
    {
      $setOnInsert: {
        key: "site",
        value: {
          brandName: "iZZ",
          heroEyebrow: "New Collection - 2026",
          heroTitle: "Wear the Difference.",
          freeDeliveryText: "Free Delivery Over Tk 1500",
          facebook: "#",
          instagram: "#",
          tiktok: "#",
          whatsapp: "#",
        },
      },
    },
    { upsert: true }
  );
  await client.close();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
