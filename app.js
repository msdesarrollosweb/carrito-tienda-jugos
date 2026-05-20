"use strict";

const CONFIG = Object.freeze({
  whatsappNumber: "5491127549094", // Cambiar por el número del negocio. Formato: país + área + número, sin + ni espacios.
  csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQf4r7QWizudQ6nZZ-aZr_dLhh8Qd4tAFktC7HORv-HcdOMTGa6Gb0W6axA9pMFVeQxi2cNQcSSHCSE/pub?output=csv", // Para Google Sheets: reemplazar por la URL publicada como CSV.
  openHour: 9,
  closeHour: 21,
  openDays: [1, 2, 3, 4, 5, 6], // Lunes a sábado. Domingo = 0.
  restaurantName: "Fresh Bliss"
});

const state = {
  products: [],
  filtered: [],
  cart: [],
  currentCategory: "Todos",
  search: ""
};

const $ = (selector) => document.querySelector(selector);
const productsGrid = $("#productsGrid");
const categoryBar = $("#categoryBar");
const promoStrip = $("#promoStrip");
const cartPanel = $("#cartPanel");
const overlay = $("#overlay");

function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  const { className, text, attributes = {}, dataset = {} } = options;

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) element.setAttribute(key, String(value));
  });

  Object.entries(dataset).forEach(([key, value]) => {
    if (value !== undefined && value !== null) element.dataset[key] = String(value);
  });

  return element;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function normalize(text = "") {
  return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toBoolean(value) {
  return normalize(value).trim() === "si" || normalize(value).trim() === "true";
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function safeImagePath(path) {
  const value = cleanText(path, "img/jugos.jpg");
  const isRelativeImage = /^img\/[\w\-.\/]+\.(jpg|jpeg|png|webp|gif)$/i.test(value);
  const isHttpsImage = /^https:\/\/[\w.-]+(?:\/[\w\-./%?=&]*)?$/i.test(value);
  return isRelativeImage || isHttpsImage ? value : "img/jugos.jpg";
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (current || row.length) {
        row.push(current.trim());
        rows.push(row);
        row = [];
        current = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current.trim());
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows.shift().map((header) => normalize(header).trim());
  return rows
    .filter((rowItem) => rowItem.length === headers.length)
    .map((rowItem) => Object.fromEntries(headers.map((header, index) => [header, rowItem[index]])))
    .map((item, index) => ({
      id: Number(item.id) || index + 1,
      nombre: cleanText(item.nombre, "Producto"),
      categoria: cleanText(item.categoria, "Otros"),
      descripcion: cleanText(item.descripcion, ""),
      precio: Math.max(0, Number(item.precio) || 0),
      imagen: safeImagePath(item.imagen),
      destacado: toBoolean(item.destacado),
      promo: toBoolean(item.promo),
      combo: toBoolean(item.combo),
      disponible: toBoolean(item.disponible)
    }));
}

async function loadProducts() {
  try {
    const response = await fetch(CONFIG.csvUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar el CSV");

    const csvText = await response.text();
    state.products = parseCSV(csvText).filter((product) => product.disponible);
    state.filtered = [...state.products];

    renderCategories();
    renderPromos();
    renderProducts();
  } catch (error) {
    clearNode(productsGrid);
    productsGrid.appendChild(createElement("p", {
      className: "empty",
      text: "No pudimos cargar el menú. Revisá el archivo productos.csv o la URL de Google Sheets."
    }));
    console.error(error);
  }
}

function renderCategories() {
  const categories = ["Todos", ...new Set(state.products.map((product) => product.categoria))];
  clearNode(categoryBar);

  categories.forEach((category) => {
    const button = createElement("button", {
      className: `category-btn ${category === state.currentCategory ? "active" : ""}`,
      text: category,
      attributes: { type: "button" },
      dataset: { category }
    });
    categoryBar.appendChild(button);
  });
}

function renderPromos() {
  const promos = state.products.filter((product) => product.promo).slice(0, 2);
  clearNode(promoStrip);

  promos.forEach((product) => {
    const card = createElement("article", { className: "promo-card" });
    card.appendChild(createElement("strong", { text: `Promo · ${product.nombre}` }));
    card.appendChild(createElement("span", { text: `${product.descripcion} · ${formatCurrency(product.precio)}` }));
    promoStrip.appendChild(card);
  });
}

function applyFilters() {
  const searchTerm = normalize(state.search);
  state.filtered = state.products.filter((product) => {
    const matchCategory = state.currentCategory === "Todos" || product.categoria === state.currentCategory;
    const matchSearch = [product.nombre, product.categoria, product.descripcion]
      .some((value) => normalize(value).includes(searchTerm));
    return matchCategory && matchSearch;
  });
  renderProducts();
  renderCategories();
}

function createBadge(text, extraClass = "") {
  return createElement("span", { className: `badge ${extraClass}`.trim(), text });
}

function renderProducts() {
  clearNode(productsGrid);

  if (!state.filtered.length) {
    productsGrid.appendChild(createElement("p", { className: "empty", text: "No encontramos productos con esa búsqueda." }));
    return;
  }

  state.filtered.forEach((product) => {
    const article = createElement("article", { className: "product-card" });
    const imageBox = createElement("div", { className: "product-image" });
    const image = createElement("img", {
      attributes: {
        src: product.imagen,
        alt: product.nombre,
        loading: "lazy",
        decoding: "async"
      }
    });
    image.addEventListener("error", () => { image.src = "img/jugos.jpg"; });
    imageBox.appendChild(image);

    const badgeRow = createElement("div", { className: "badge-row" });
    if (product.destacado) badgeRow.appendChild(createBadge("Destacado"));
    if (product.promo) badgeRow.appendChild(createBadge("Promo"));
    if (product.combo) badgeRow.appendChild(createBadge("Combo", "combo"));
    imageBox.appendChild(badgeRow);

    const body = createElement("div", { className: "product-body" });
    body.appendChild(createElement("span", { className: "section-kicker", text: product.categoria }));
    body.appendChild(createElement("h3", { text: product.nombre }));
    body.appendChild(createElement("p", { text: product.descripcion }));

    const footer = createElement("div", { className: "product-footer" });
    footer.appendChild(createElement("span", { className: "price", text: formatCurrency(product.precio) }));
    footer.appendChild(createElement("button", {
      className: "add-btn",
      text: "Agregar",
      attributes: { type: "button" },
      dataset: { id: product.id }
    }));
    body.appendChild(footer);

    article.append(imageBox, body);
    productsGrid.appendChild(article);
  });
}

function addToCart(id) {
  const product = state.products.find((item) => item.id === Number(id));
  if (!product) return;

  const existing = state.cart.find((item) => item.id === Number(id));
  if (existing) existing.quantity++;
  else state.cart.push({ ...product, quantity: 1 });

  updateCart();
  animateCartButton();
  showCartToast(`${product.nombre} agregado`);
  openCart();
}

function changeQuantity(id, delta) {
  const item = state.cart.find((product) => product.id === Number(id));
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) state.cart = state.cart.filter((product) => product.id !== Number(id));
  updateCart();
}

function animateCartButton() {
  const button = $("#floatingCart");
  if (!button) return;
  button.classList.remove("bump");
  void button.offsetWidth;
  button.classList.add("bump");
}

function showCartToast(message = "Producto agregado al carrito") {
  const toast = $("#cartToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showCartToast.timeoutId);
  showCartToast.timeoutId = setTimeout(() => toast.classList.remove("show"), 1600);
}

function getDeliveryPrice() {
  const selected = $("#deliveryZone")?.selectedOptions?.[0];
  return Number(selected?.dataset?.price || 0);
}

function updateCart() {
  const cartItems = $("#cartItems");
  const subtotal = state.cart.reduce((sum, item) => sum + item.precio * item.quantity, 0);
  const delivery = getDeliveryPrice();
  const total = subtotal + delivery;
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  $("#cartCount").textContent = count;
  const cartButtonSubtotal = $("#cartButtonSubtotal");
  if (cartButtonSubtotal) cartButtonSubtotal.textContent = formatCurrency(subtotal);
  $("#subtotal").textContent = formatCurrency(subtotal);
  $("#deliveryCost").textContent = formatCurrency(delivery);
  $("#total").textContent = formatCurrency(total);

  const whatsappTotal = $("#whatsappTotal");
  if (whatsappTotal) whatsappTotal.textContent = formatCurrency(total);

  const sendButton = $("#sendWhatsApp");
  if (sendButton) sendButton.disabled = !state.cart.length;

  clearNode(cartItems);
  if (!state.cart.length) {
    cartItems.appendChild(createElement("p", { className: "empty", text: "Tu carrito está vacío. Agregá productos del menú." }));
    return;
  }

  state.cart.forEach((item) => {
    const cartItem = createElement("div", { className: "cart-item" });
    const detail = createElement("div");
    detail.appendChild(createElement("h4", { text: item.nombre }));
    detail.appendChild(createElement("small", { text: `${formatCurrency(item.precio)} c/u` }));

    const qty = createElement("div", { className: "qty" });
    qty.appendChild(createElement("button", {
      text: "−",
      attributes: { type: "button", "aria-label": `Quitar ${item.nombre}` },
      dataset: { action: "minus", id: item.id }
    }));
    qty.appendChild(createElement("strong", { text: item.quantity }));
    qty.appendChild(createElement("button", {
      text: "+",
      attributes: { type: "button", "aria-label": `Agregar ${item.nombre}` },
      dataset: { action: "plus", id: item.id }
    }));

    cartItem.append(detail, qty);
    cartItems.appendChild(cartItem);
  });
}

function openCart() {
  cartPanel.classList.add("open");
  cartPanel.setAttribute("aria-hidden", "false");
  overlay.classList.add("show");
  document.body.classList.add("body-lock");
}

function closeCart() {
  cartPanel.classList.remove("open");
  cartPanel.setAttribute("aria-hidden", "true");
  overlay.classList.remove("show");
  document.body.classList.remove("body-lock");
}

function updateStoreStatus() {
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isBusinessDay = CONFIG.openDays.includes(currentDay);
  const isOpen = isBusinessDay && currentHour >= CONFIG.openHour && currentHour < CONFIG.closeHour;
  const status = $("#storeStatus");

  status.textContent = isOpen ? "Ya estamos atendiendo !!!" : "Cerrado ahora";
  status.classList.toggle("open", isOpen);
  status.classList.toggle("closed", !isOpen);
}

function buildWhatsAppMessage() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.precio * item.quantity, 0);
  const delivery = getDeliveryPrice();
  const total = subtotal + delivery;
  const zone = $("#deliveryZone").selectedOptions[0].textContent;
  const address = $("#customerAddress").value.trim() || "No indicada";
  const notes = $("#customerNotes").value.trim() || "Sin notas";
  const items = state.cart
    .map((item) => `• ${item.quantity} x ${item.nombre} - ${formatCurrency(item.precio * item.quantity)}`)
    .join("\n");

  return `Hola ${CONFIG.restaurantName}, quiero hacer este pedido:\n\n${items}\n\nProductos: ${formatCurrency(subtotal)}\nDelivery: ${formatCurrency(delivery)}\nTotal: ${formatCurrency(total)}\n\nZona: ${zone}\nDirección: ${address}\nNotas: ${notes}`;
}

function sendOrder() {
  if (!state.cart.length) {
    alert("Agregá al menos un producto al carrito.");
    return;
  }

  const message = encodeURIComponent(buildWhatsAppMessage());
  window.open(`https://wa.me/${CONFIG.whatsappNumber}?text=${message}`, "_blank", "noopener,noreferrer");
}

productsGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".add-btn");
  if (button) addToCart(button.dataset.id);
});

categoryBar.addEventListener("click", (event) => {
  const button = event.target.closest(".category-btn");
  if (!button) return;
  state.currentCategory = button.dataset.category;
  applyFilters();
});

$("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  applyFilters();
});

$("#cartItems").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  changeQuantity(button.dataset.id, button.dataset.action === "plus" ? 1 : -1);
});

$("#deliveryZone").addEventListener("change", updateCart);
$("#floatingCart").addEventListener("click", openCart);
$("#openCartTop").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCart();
});
$("#sendWhatsApp").addEventListener("click", sendOrder);

updateStoreStatus();
setInterval(updateStoreStatus, 60000);
updateCart();
loadProducts();
