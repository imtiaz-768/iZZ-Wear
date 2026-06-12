const adminState = {
  token: localStorage.getItem("izzToken") || "",
  user: JSON.parse(localStorage.getItem("izzUser") || "null"),
  products: [],
  orders: [],
};

const money = (value) => `Tk ${Number(value || 0).toLocaleString("en-BD")}`;
const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(adminState.token ? { Authorization: `Bearer ${adminState.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong");
  return data;
};

function setSession(payload) {
  adminState.token = payload.token;
  adminState.user = payload.user;
  localStorage.setItem("izzToken", payload.token);
  localStorage.setItem("izzUser", JSON.stringify(payload.user));
  renderLogin();
}

function renderLogin() {
  document.querySelector("#adminLoginBtn").textContent = adminState.user ? adminState.user.name : "Admin Login";
}

function fillForm(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input) return;
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value ?? "";
  });
}

async function loadProducts() {
  adminState.products = await api("/api/products?includeInactive=true");
  document.querySelector("#adminProducts").innerHTML = adminState.products.map((product) => `
    <div class="table-row">
      <div>
        <strong>${product.name}</strong>
        <p class="muted">${product.category} - ${money(product.price)} - Stock ${product.stock} - ${product.active === false ? "Inactive" : "Active"}</p>
      </div>
      <div class="button-row">
        <button class="btn-outline" data-edit-product="${product.id}">Edit</button>
        <button class="btn-primary" data-disable-product="${product.id}">Disable</button>
      </div>
    </div>
  `).join("") || `<p class="muted">No products yet.</p>`;
}

async function loadOrders() {
  if (!adminState.token) return;
  adminState.orders = await api("/api/orders");
  document.querySelector("#adminOrders").innerHTML = adminState.orders.map((order) => `
    <div class="table-row">
      <div>
        <strong>${order.id}</strong>
        <p>${order.customer?.name || "Customer"} - ${money(order.total)}</p>
        <p class="muted">${order.items.map((item) => `${item.name} x ${item.quantity}`).join(", ")}</p>
        <input placeholder="Tracking number" value="${order.trackingNumber || ""}" data-track="${order.id}" />
      </div>
      <div>
        <select data-order-status="${order.id}">
          ${["placed", "processing", "packed", "shipped", "delivered", "cancelled"].map((status) => `<option ${order.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <select data-payment-status="${order.id}">
          ${["pending", "paid", "failed", "refunded", "cash_on_delivery"].map((status) => `<option ${order.paymentStatus === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <button class="btn-primary" data-save-order="${order.id}">Save</button>
      </div>
    </div>
  `).join("") || `<p class="muted">No orders yet.</p>`;
}

async function loadSettings() {
  const settings = await api("/api/settings");
  fillForm(document.querySelector("#settingsForm"), settings);
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.active = form.elements.active.checked;
  const id = data.id;
  delete data.id;
  try {
    await api(id ? `/api/products/${id}` : "/api/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    });
    document.querySelector("#productMessage").textContent = "Product saved.";
    form.reset();
    form.elements.active.checked = true;
    await loadProducts();
  } catch (error) {
    document.querySelector("#productMessage").textContent = error.message;
  }
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
    });
    document.querySelector("#settingsMessage").textContent = "Settings saved.";
  } catch (error) {
    document.querySelector("#settingsMessage").textContent = error.message;
  }
}

async function adminAuth(event) {
  event.preventDefault();
  const mode = event.submitter?.value || "login";
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const session = await api(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSession(session);
    document.querySelector("#adminAuthMessage").textContent = session.user.role === "admin" ? "Admin session ready." : "Logged in, but this account is not admin.";
    await Promise.all([loadProducts(), loadOrders(), loadSettings()]);
  } catch (error) {
    document.querySelector("#adminAuthMessage").textContent = error.message;
  }
}

async function saveOrder(id) {
  const status = document.querySelector(`[data-order-status="${id}"]`).value;
  const paymentStatus = document.querySelector(`[data-payment-status="${id}"]`).value;
  const trackingNumber = document.querySelector(`[data-track="${id}"]`).value;
  await api(`/api/orders/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status, paymentStatus, trackingNumber }),
  });
  await loadOrders();
}

function bindEvents() {
  document.querySelector("#productForm").addEventListener("submit", saveProduct);
  document.querySelector("#settingsForm").addEventListener("submit", saveSettings);
  document.querySelector("#adminAuthForm").addEventListener("submit", adminAuth);
  document.querySelector("#clearProduct").addEventListener("click", () => {
    document.querySelector("#productForm").reset();
    document.querySelector("#productForm").elements.active.checked = true;
  });
  document.body.addEventListener("click", async (event) => {
    const editId = event.target.dataset.editProduct;
    const disableId = event.target.dataset.disableProduct;
    const saveOrderId = event.target.dataset.saveOrder;
    if (editId) {
      const product = adminState.products.find((item) => item.id === editId);
      fillForm(document.querySelector("#productForm"), { ...product, active: product.active !== false });
      scrollTo({ top: document.querySelector("#products").offsetTop - 80, behavior: "smooth" });
    }
    if (disableId) {
      await api(`/api/products/${disableId}`, { method: "DELETE" });
      await loadProducts();
    }
    if (saveOrderId) await saveOrder(saveOrderId);
  });
}

async function init() {
  renderLogin();
  bindEvents();
  await loadSettings();
  await loadProducts();
  if (adminState.token) await loadOrders();
}

init().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<div class="list-panel" style="margin:6rem 1rem 1rem">${error.message}</div>`);
});
