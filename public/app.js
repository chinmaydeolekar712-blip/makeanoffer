const cartBody = document.getElementById("cart-body");
const totalsEl = document.getElementById("totals");
const statusEl = document.getElementById("status");
const offerBtn = document.getElementById("offer-btn");
const modal = document.getElementById("offer-modal");
const offerInput = document.getElementById("offer-input");

let products = [];
let settings = null;
let quantities = {};

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function lineItems() {
  return products.map((product) => ({
    id: product.id,
    quantity: quantities[product.id] ?? product.defaultQty,
  }));
}

function currentLines() {
  const excluded = new Set(settings?.excludedProductIds || []);
  return products.map((product) => {
    const quantity = quantities[product.id] ?? product.defaultQty;
    const lineTotal = product.unitPrice * quantity;
    return {
      ...product,
      quantity,
      lineTotal,
      excluded: excluded.has(product.id),
    };
  });
}

function renderCart() {
  const lines = currentLines();
  cartBody.innerHTML = lines
    .map(
      (line) => `
      <tr>
        <td data-label="Product">
          <div class="product-name">${line.name}</div>
          <span class="product-desc">${line.description}</span>
          ${line.excluded ? '<span class="badge">Not eligible</span>' : ""}
        </td>
        <td data-label="Qty">
          <input class="qty" type="number" min="0" step="1" value="${line.quantity}" data-id="${line.id}" />
        </td>
        <td data-label="Unit price" class="money">${money(line.unitPrice)}</td>
        <td data-label="Line total" class="money">${money(line.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const eligible = lines.filter((l) => !l.excluded).reduce((sum, l) => sum + l.lineTotal, 0);
  const excluded = lines.filter((l) => l.excluded).reduce((sum, l) => sum + l.lineTotal, 0);
  const cart = eligible + excluded;
  const available = settings && eligible >= settings.minCartSubtotal;
  const minEligible = settings
    ? eligible * (1 - settings.maxDiscountPercent / 100)
    : eligible;
  const minCart = minEligible + excluded;

  totalsEl.innerHTML = `
    <dt>Eligible subtotal</dt><dd class="money">${money(eligible)}</dd>
    <dt>Excluded (full price)</dt><dd class="money">${money(excluded)}</dd>
    <dt class="grand">Cart total</dt><dd class="grand money">${money(cart)}</dd>
  `;

  offerBtn.disabled = !available;
  statusEl.hidden = false;
  statusEl.className = "result" + (available ? "" : " warn");
  statusEl.textContent = available
    ? `Bargaining is open. Lowest acceptable cart total with current rules: ${money(minCart)}.`
    : `Bargaining is locked until eligible items reach ${money(settings?.minCartSubtotal ?? 0)}. Eligible total is ${money(eligible)}.`;
}

async function load() {
  const [catalogRes, settingsRes] = await Promise.all([
    fetch("/api/catalog"),
    fetch("/api/settings"),
  ]);
  const catalog = await catalogRes.json();
  const payload = await settingsRes.json();
  products = catalog.products;
  settings = payload.settings;
  products.forEach((product) => {
    if (quantities[product.id] == null) quantities[product.id] = product.defaultQty;
  });
  renderCart();
}

cartBody.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-id]");
  if (!input) return;
  const qty = Math.max(0, Math.floor(Number(input.value) || 0));
  quantities[input.dataset.id] = qty;
  input.value = qty;
  renderCart();
});

offerBtn.addEventListener("click", () => {
  const lines = currentLines();
  const excluded = lines.filter((l) => l.excluded).reduce((sum, l) => sum + l.lineTotal, 0);
  const eligible = lines.filter((l) => !l.excluded).reduce((sum, l) => sum + l.lineTotal, 0);
  const minCart = eligible * (1 - (settings?.maxDiscountPercent || 0) / 100) + excluded;
  offerInput.value = minCart.toFixed(2);
  modal.classList.add("open");
  offerInput.focus();
});

document.getElementById("cancel-offer").addEventListener("click", () => {
  modal.classList.remove("open");
});

document.getElementById("submit-offer").addEventListener("click", async () => {
  const res = await fetch("/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: lineItems(),
      offeredTotal: offerInput.value,
    }),
  });
  const decision = await res.json();
  modal.classList.remove("open");
  statusEl.hidden = false;
  statusEl.className =
    "result " + (decision.accepted ? "ok" : decision.status === "unavailable" ? "warn" : "bad");
  statusEl.textContent = decision.message;
});

load().catch((error) => {
  statusEl.hidden = false;
  statusEl.className = "result bad";
  statusEl.textContent = `Could not load cart: ${error.message}`;
});
