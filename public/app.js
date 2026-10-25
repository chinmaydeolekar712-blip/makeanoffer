"use strict";

const cartBody = document.getElementById("cart-body");
const itemCountEl = document.getElementById("item-count");
const summarySubtotalEl = document.getElementById("summary-subtotal");
const summaryGrandEl = document.getElementById("summary-grand");
const statusEl = document.getElementById("status");
const statusTitleEl = document.getElementById("status-title");
const statusContentEl = document.getElementById("status-content");

const thresholdCard = document.getElementById("threshold-card");
const thresholdBadge = document.getElementById("threshold-badge");
const progressBar = document.getElementById("progress-bar");
const thresholdText = document.getElementById("threshold-text");
const thresholdTarget = document.getElementById("threshold-target");

const offerBtn = document.getElementById("offer-btn");
const offerBtnText = document.getElementById("offer-btn-text");

const modal = document.getElementById("offer-modal");
const offerInput = document.getElementById("offer-input");
const modalCartTotal = document.getElementById("modal-cart-total");
const savingsHint = document.getElementById("savings-hint");
const quickOffers = document.getElementById("quick-offers");

let products = [];
let settings = null;
let quantities = {};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function lineItems() {
  return products.map((product) => ({
    id: product.id,
    quantity: quantities[product.id] ?? product.defaultQty,
  }));
}

function currentLines() {
  return products.map((product) => {
    const quantity = quantities[product.id] ?? product.defaultQty;
    const lineTotal = product.unitPrice * quantity;
    return {
      ...product,
      quantity,
      lineTotal,
    };
  });
}

function renderCart() {
  const lines = currentLines();
  
  // Render table rows
  cartBody.innerHTML = lines
    .map(
      (line) => `
      <tr>
        <td data-label="Specification">
          <div class="product-cell">
            <span class="product-name">${line.name}</span>
            <span class="product-desc">${line.description}</span>
          </div>
        </td>
        <td data-label="Units">
          <div class="stepper">
            <button type="button" class="stepper-btn stepper-minus" data-id="${line.id}" aria-label="Decrease units">−</button>
            <input class="stepper-input" type="number" min="0" step="1" value="${line.quantity}" data-id="${line.id}" />
            <button type="button" class="stepper-btn stepper-plus" data-id="${line.id}" aria-label="Increase units">+</button>
          </div>
        </td>
        <td data-label="Unit Price" class="money unit-price">${money(line.unitPrice)}</td>
        <td data-label="Total" class="money line-total" style="text-align: right;">${money(line.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const cartSubtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const totalItemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const minCart = settings ? settings.minCartSubtotal : 500;
  const isAvailable = cartSubtotal >= minCart;
  const diffNeeded = Math.max(0, minCart - cartSubtotal);
  const percentFilled = minCart > 0 ? Math.min(100, Math.round((cartSubtotal / minCart) * 100)) : 100;

  // Update order summary
  itemCountEl.textContent = totalItemCount;
  summarySubtotalEl.textContent = money(cartSubtotal);
  summaryGrandEl.textContent = money(cartSubtotal);

  // Update threshold unlock gauge
  thresholdTarget.textContent = `UNLOCK AT ${money(minCart)}`;
  progressBar.style.width = `${percentFilled}%`;

  if (isAvailable) {
    thresholdBadge.className = "spec-meter-status unlocked";
    thresholdBadge.textContent = "UNLOCKED";
    progressBar.classList.add("unlocked");
    thresholdText.innerHTML = `Order subtotal exceeds the seller qualification threshold of <strong>${money(minCart)}</strong>. Direct negotiation protocol is available.`;

    offerBtn.disabled = false;
    offerBtnText.textContent = "SUBMIT ACQUISITION OFFER";
  } else {
    thresholdBadge.className = "spec-meter-status locked";
    thresholdBadge.textContent = "LOCKED";
    progressBar.classList.remove("unlocked");
    thresholdText.innerHTML = `Add <strong>${money(diffNeeded)}</strong> more to satisfy the seller threshold of <strong>${money(minCart)}</strong> and enable price proposals.`;

    offerBtn.disabled = true;
    offerBtnText.textContent = `LOCKED &mdash; MIN ${money(minCart)}`;
  }
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
    if (quantities[product.id] == null) {
      quantities[product.id] = product.defaultQty;
    }
  });
  renderCart();
}

// Stepper click handlers
cartBody.addEventListener("click", (event) => {
  const btn = event.target.closest(".stepper-btn");
  if (!btn) return;
  const id = btn.dataset.id;
  const current = quantities[id] ?? 0;
  if (btn.classList.contains("stepper-minus")) {
    quantities[id] = Math.max(0, current - 1);
  } else if (btn.classList.contains("stepper-plus")) {
    quantities[id] = current + 1;
  }
  renderCart();
});

// Manual quantity input change
cartBody.addEventListener("change", (event) => {
  const input = event.target.closest(".stepper-input");
  if (!input) return;
  const qty = Math.max(0, Math.floor(Number(input.value) || 0));
  quantities[input.dataset.id] = qty;
  renderCart();
});

// Update modal quick buttons & savings hint
function updateOfferCalculations() {
  const lines = currentLines();
  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  modalCartTotal.textContent = money(total);

  const q5 = document.getElementById("quick-5");
  const q10 = document.getElementById("quick-10");
  const q15 = document.getElementById("quick-15");

  if (q5) q5.textContent = money(total * 0.95);
  if (q10) q10.textContent = money(total * 0.90);
  if (q15) q15.textContent = money(total * 0.85);

  updateSavingsHint();
}

function updateSavingsHint() {
  const lines = currentLines();
  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const offered = Number(offerInput.value);

  if (offered && offered > 0 && total > 0) {
    if (offered < total) {
      const diff = total - offered;
      const pct = ((diff / total) * 100).toFixed(1);
      savingsHint.textContent = `Proposed reduction: $${diff.toFixed(2)} (${pct}% below catalog total)`;
      savingsHint.style.color = "var(--success)";
    } else {
      savingsHint.textContent = `Offer is at or above listed catalog valuation.`;
      savingsHint.style.color = "var(--muted)";
    }
  } else {
    savingsHint.textContent = "";
  }
}

// Quick offer selection buttons
quickOffers.addEventListener("click", (event) => {
  const btn = event.target.closest(".quick-btn");
  if (!btn) return;
  const pct = Number(btn.dataset.percent);
  const lines = currentLines();
  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const proposed = Math.round(total * (1 - pct / 100) * 100) / 100;
  offerInput.value = proposed.toFixed(2);
  updateSavingsHint();
});

offerInput.addEventListener("input", updateSavingsHint);

// Open modal
offerBtn.addEventListener("click", () => {
  const lines = currentLines();
  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  // Default offer: 10% reduction
  const defaultOffer = Math.round(total * 0.90 * 100) / 100;
  offerInput.value = defaultOffer.toFixed(2);
  updateOfferCalculations();
  modal.classList.add("open");
  offerInput.focus();
  offerInput.select();
});

// Close modal
document.getElementById("cancel-offer").addEventListener("click", () => {
  modal.classList.remove("open");
});

// Submit offer
document.getElementById("submit-offer").addEventListener("click", async () => {
  try {
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
    const isOk = decision.accepted;
    const isWarn = decision.status === "unavailable";
    
    statusEl.className = `status-callout ${isOk ? "ok" : isWarn ? "warn" : "bad"}`;
    if (statusTitleEl) {
      statusTitleEl.textContent = isOk ? "OFFER ACCEPTED" : isWarn ? "OFFER UNAVAILABLE" : "OFFER DECLINED";
    }
    
    statusContentEl.innerHTML = `<div>${decision.message}</div>`;
  } catch (err) {
    modal.classList.remove("open");
    statusEl.hidden = false;
    statusEl.className = "status-callout bad";
    if (statusTitleEl) statusTitleEl.textContent = "COMMUNICATION ERROR";
    statusContentEl.innerHTML = `<div>${err.message}</div>`;
  }
});

load().catch((error) => {
  statusEl.hidden = false;
  statusEl.className = "status-callout bad";
  if (statusTitleEl) statusTitleEl.textContent = "INITIALIZATION ERROR";
  statusContentEl.textContent = `Could not load catalog: ${error.message}`;
});
