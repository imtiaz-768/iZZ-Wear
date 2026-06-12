const state = {
  products: [],
  settings: {},
  token: localStorage.getItem("izzToken") || "",
  user: JSON.parse(localStorage.getItem("izzUser") || "null"),
};

const money = (value) => `Tk ${Number(value || 0).toLocaleString("en-BD")}`;
const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong");
  return data;
};

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("izzToken", payload.token);
  localStorage.setItem("izzUser", JSON.stringify(payload.user));
  renderAccount();
}

function renderAccount() {
  const btn = document.querySelector("#accountBtn");
  if (!btn) return;
  btn.textContent = state.user ? state.user.name : "Login";
}

function productImage(product) {
  if (product.imageUrl) return `<img src="${product.imageUrl}" alt="${product.name}">`;
  return `<span class="prod-placeholder">${product.category?.toLowerCase().includes("shirt") ? "Sh" : product.category?.toLowerCase().includes("pant") ? "Pt" : "T"}</span>`;
}

function renderProducts() {
  const grid = document.querySelector("#productsGrid");
  grid.innerHTML = state.products.map((product) => `
    <article class="prod-card">
      <div class="prod-img">
        ${productImage(product)}
        ${product.badge ? `<span class="prod-badge">${product.badge}</span>` : ""}
      </div>
      <div class="prod-body">
        <p class="prod-name">${product.name}</p>
        <p class="prod-cat">${product.category}</p>
        <p class="prod-desc">${product.description || "Premium everyday menswear from iZZ."}</p>
        <span class="prod-price">${money(product.price)}</span>
        ${product.oldPrice ? `<span class="prod-price-old">${money(product.oldPrice)}</span>` : ""}
        <div class="prod-actions">
          <span class="stock">${product.stock > 0 ? `${product.stock} in stock` : "Sold out"}</span>
          <button class="btn-primary" data-add="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>Add</button>
        </div>
      </div>
    </article>
  `).join("");
}

function renderCategories() {
  const categories = [...new Set(state.products.map((product) => product.category || "Other"))];
  document.querySelector("#categoriesGrid").innerHTML = categories.map((category) => {
    const count = state.products.filter((product) => product.category === category).length;
    return `
      <div class="cat-card" data-category="${category}">
        <span class="cat-icon-big">${category.slice(0, 3)}</span>
        <div class="cat-info"><h3>${category}</h3><p>${count} styles available</p></div>
      </div>
    `;
  }).join("");
  document.querySelector("#footerCategories").innerHTML = categories.map((category) => `<li><a href="#products">${category}</a></li>`).join("");
}

function renderSettings() {
  document.querySelector("#heroEyebrow").textContent = state.settings.heroEyebrow || "New Collection - 2026";
  document.querySelector("#deliveryText").textContent = state.settings.freeDeliveryText || "Free Delivery Over Tk 1500";
  const socials = ["facebook", "instagram", "tiktok", "whatsapp"];
  document.querySelector("#footerSocials").innerHTML = socials.map((key) => `<li><a href="${state.settings[key] || "#"}">${key[0].toUpperCase() + key.slice(1)}</a></li>`).join("");
  document.querySelector("#socialLinks").innerHTML = socials.slice(0, 3).map((key) => `<a href="${state.settings[key] || "#"}">${key}</a>`).join("");
}

async function loadCart() {
  const panel = document.querySelector("#cartItems");
  if (!state.token) {
    panel.innerHTML = `<p class="muted">Login to keep a cart and checkout.</p>`;
    return;
  }
  const cart = await api("/api/cart");
  if (!cart.items.length) {
    panel.innerHTML = `<p class="muted">Your cart is empty.</p>`;
    return;
  }
  panel.innerHTML = `
    ${cart.items.map((item) => `
      <div class="cart-row">
        <div><strong>${item.name}</strong><p class="muted">${money(item.price)} each</p></div>
        <input type="number" min="0" max="${item.stock}" value="${item.quantity}" data-qty="${item.productId}" />
        <strong>${money(item.lineTotal)}</strong>
      </div>
    `).join("")}
    <div class="cart-row"><strong>Total</strong><span></span><strong>${money(cart.total)}</strong></div>
  `;
}

async function loadOrders() {
  const list = document.querySelector("#ordersList");
  if (!state.token) {
    list.innerHTML = `<p class="muted">Login to see order tracking.</p>`;
    return;
  }
  const orders = await api("/api/orders");
  list.innerHTML = orders.length ? orders.map((order) => `
    <article class="order-card">
      <span class="status-pill">${order.status}</span>
      <h3>${order.id}</h3>
      <p>${order.items.length} item(s) - ${money(order.total)}</p>
      <p class="muted">Payment: ${order.paymentMethod} / ${order.paymentStatus}</p>
      <p class="muted">Tracking: ${order.trackingNumber || "Preparing"}</p>
    </article>
  `).join("") : `<p class="muted">No orders yet.</p>`;
}

async function addToCart(productId) {
  if (!state.token) {
    document.querySelector("#authDialog").showModal();
    return;
  }
  await api("/api/cart/items", {
    method: "POST",
    body: JSON.stringify({ productId, quantity: 1 }),
  });
  await loadCart();
  location.hash = "cart";
}

async function checkout(event) {
  event.preventDefault();
  const message = document.querySelector("#checkoutMessage");
  if (!state.token) {
    document.querySelector("#authDialog").showModal();
    return;
  }
  const form = new FormData(event.currentTarget);
  const paymentMethod = form.get("paymentMethod");
  let paymentReference = "";
  try {
    if (paymentMethod !== "cod") {
      const cart = await api("/api/cart");
      const payment = await api("/api/payments/initiate", {
        method: "POST",
        body: JSON.stringify({ provider: paymentMethod, amount: cart.total }),
      });
      paymentReference = payment.reference;
    }
    await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        paymentMethod,
        paymentReference,
        shippingAddress: {
          name: form.get("name"),
          phone: form.get("phone"),
          address: form.get("address"),
        },
      }),
    });
    message.textContent = "Order placed. You can track it below.";
    event.currentTarget.reset();
    await Promise.all([loadCart(), loadOrders(), loadProducts()]);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function authSubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const mode = submitter?.value || "login";
  const form = new FormData(event.currentTarget);
  const payload = {
    name: form.get("name"),
    email: form.get("email"),
    phone: form.get("phone"),
    password: form.get("password"),
  };
  try {
    const session = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
    setSession(session);
    document.querySelector("#authDialog").close();
    await Promise.all([loadCart(), loadOrders()]);
  } catch (error) {
    document.querySelector("#authMessage").textContent = error.message;
  }
}

async function loadProducts() {
  state.products = await api("/api/products");
  renderProducts();
  renderCategories();
}

async function init() {
  renderAccount();
  state.settings = await api("/api/settings");
  renderSettings();
  await loadProducts();
  await Promise.all([loadCart(), loadOrders()]);

  document.body.addEventListener("click", async (event) => {
    const addButton = event.target.closest("[data-add]");
    if (addButton) await addToCart(addButton.dataset.add);
    if (event.target.id === "accountBtn") document.querySelector("#authDialog").showModal();
    if (event.target.id === "closeAuth") document.querySelector("#authDialog").close();
  });

  document.body.addEventListener("change", async (event) => {
    if (event.target.matches("[data-qty]")) {
      await api(`/api/cart/items/${event.target.dataset.qty}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: Number(event.target.value) }),
      });
      await loadCart();
    }
  });

  document.querySelector("#checkoutForm").addEventListener("submit", checkout);
  document.querySelector("#authForm").addEventListener("submit", authSubmit);
}

init().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<div class="list-panel" style="margin:6rem 1rem 1rem">${error.message}</div>`);
});
