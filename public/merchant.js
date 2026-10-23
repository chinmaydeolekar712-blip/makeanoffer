const form = document.getElementById("settings-form");
const minCart = document.getElementById("min-cart");
const maxDiscount = document.getElementById("max-discount");
const exclusions = document.getElementById("exclusions");
const preview = document.getElementById("preview");
const saveStatus = document.getElementById("save-status");

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function renderPreview(data) {
  const { settings, preview: p } = data;
  preview.innerHTML = `
    <dt>Min eligible subtotal</dt><dd class="money">${money(settings.minCartSubtotal)}</dd>
    <dt>Max discount</dt><dd>${settings.maxDiscountPercent}%</dd>
    <dt>Eligible (sample cart)</dt><dd class="money">${money(p.eligibleSubtotal)}</dd>
    <dt>Excluded (sample cart)</dt><dd class="money">${money(p.excludedSubtotal)}</dd>
    <dt>Lowest acceptable total</dt><dd class="money">${money(p.minAcceptableCart)}</dd>
    <dt class="grand">Bargaining</dt>
    <dd class="grand">${p.bargainingAvailable ? "Available" : "Locked"}</dd>
  `;
}

async function load() {
  const [catalogRes, settingsRes] = await Promise.all([
    fetch("/api/catalog"),
    fetch("/api/settings"),
  ]);
  const catalog = await catalogRes.json();
  const payload = await settingsRes.json();
  minCart.value = payload.settings.minCartSubtotal;
  maxDiscount.value = payload.settings.maxDiscountPercent;
  const excluded = new Set(payload.settings.excludedProductIds);
  exclusions.innerHTML = catalog.products
    .map(
      (product) => `
      <label>
        <input type="checkbox" name="excluded" value="${product.id}" ${excluded.has(product.id) ? "checked" : ""} />
        <span>
          <strong>${product.name}</strong>
          <span class="product-desc">${product.description} · ${money(product.unitPrice)}</span>
        </span>
      </label>`
    )
    .join("");
  renderPreview(payload);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const excludedProductIds = [...form.querySelectorAll('input[name="excluded"]:checked')].map(
    (input) => input.value
  );
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minCartSubtotal: minCart.value,
      maxDiscountPercent: maxDiscount.value,
      excludedProductIds,
    }),
  });
  const payload = await res.json();
  saveStatus.hidden = false;
  if (!res.ok) {
    saveStatus.className = "result bad";
    saveStatus.textContent = (payload.errors || [payload.message || "Could not save."]).join(" ");
    return;
  }
  saveStatus.className = "result ok";
  saveStatus.textContent = "Settings saved. New offers use these rules immediately.";
  renderPreview(payload);
});

load().catch((error) => {
  saveStatus.hidden = false;
  saveStatus.className = "result bad";
  saveStatus.textContent = `Could not load settings: ${error.message}`;
});
