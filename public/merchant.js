"use strict";

const siteId = "site_demo_wholesaler";
const adminInput = document.getElementById("admin-secret-input");
const btnSyncAuth = document.getElementById("btn-sync-auth");

const form = document.getElementById("settings-form");

// Slider & discount controls
const minCartSlider = document.getElementById("min-cart-slider");
const minCartHidden = document.getElementById("min-cart");
const sliderValueDisplay = document.getElementById("slider-value-display");
const maxDiscount = document.getElementById("max-discount");
const permittedOrigins = document.getElementById("permitted-origins");
const unsavedIndicator = document.getElementById("unsaved-indicator");

// Status & preview
const saveStatus = document.getElementById("save-status");
const saveStatusTitle = document.getElementById("save-status-title");
const saveStatusText = document.getElementById("save-status-text");

const prevThreshold = document.getElementById("prev-threshold");
const prevDiscount = document.getElementById("prev-discount");
const prevStatus = document.getElementById("prev-status");
const prevFloor = document.getElementById("prev-floor");
const formulaExample = document.getElementById("formula-example");

// Keys & offers
const keysTableBody = document.getElementById("keys-table-body");
const btnGenerateKey = document.getElementById("btn-generate-key");
const newKeyAlert = document.getElementById("new-key-alert");
const newKeySecret = document.getElementById("new-key-secret");
const offersTableBody = document.getElementById("offers-table-body");

// Track saved values to detect unsaved changes
let savedMinCart = 300;
let savedMaxDiscount = 15;

function getAuthHeader() {
  const secret = (adminInput.value || "").trim();
  return { Authorization: `Bearer ${secret}` };
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

// ── Slider ──────────────────────────────────────────────────────────────────

function updateSliderDisplay(value) {
  const v = Number(value);
  sliderValueDisplay.textContent = `$${v.toLocaleString()}`;
  minCartHidden.value = v;

  // Highlight track fill via background gradient
  const pct = ((v - 1) / (1000 - 1)) * 100;
  minCartSlider.style.background = `linear-gradient(to right, var(--on-dark) 0%, var(--on-dark) ${pct}%, var(--hairline-strong) ${pct}%, var(--hairline-strong) 100%)`;

  markUnsaved();
  updateLivePreview();
}

minCartSlider.addEventListener("input", (e) => {
  updateSliderDisplay(e.target.value);
});

maxDiscount.addEventListener("input", () => {
  markUnsaved();
  updateLivePreview();
});

// ── Unsaved changes indicator ────────────────────────────────────────────────

function markUnsaved() {
  const currentMin = Number(minCartSlider.value);
  const currentMax = Number(maxDiscount.value);
  const hasChanges = currentMin !== savedMinCart || currentMax !== savedMaxDiscount;
  unsavedIndicator.style.opacity = hasChanges ? "1" : "0";

  // Pulse the display colour when changed from saved value
  if (sliderValueDisplay) {
    sliderValueDisplay.classList.toggle("changed", currentMin !== savedMinCart);
  }
}

// ── Live preview panel ───────────────────────────────────────────────────────

const SAMPLE_CART = 540.0;

function updateLivePreview() {
  const minCart = Number(minCartSlider.value) || 300;
  const maxDisc = Number(maxDiscount.value) || 15;

  prevThreshold.textContent = money(minCart);
  prevDiscount.textContent = `${maxDisc}%`;

  const isUnlocked = SAMPLE_CART >= minCart;
  if (isUnlocked) {
    prevStatus.innerHTML = `<span style="color: var(--success); font-family: var(--font-mono);">UNLOCKED</span>`;
  } else {
    prevStatus.innerHTML = `<span style="color: var(--warning); font-family: var(--font-mono);">LOCKED (need ${money(minCart - SAMPLE_CART)} more)</span>`;
  }

  const floor = Math.round(SAMPLE_CART * (1 - maxDisc / 100) * 100) / 100;
  prevFloor.textContent = money(floor);

  // Formula example
  if (formulaExample) {
    formulaExample.textContent = `e.g. $${SAMPLE_CART} × (1 − ${maxDisc}%/100) = ${money(floor)}`;
  }
}

// ── Tab navigation ───────────────────────────────────────────────────────────

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    btn.classList.add("active");
    const tabId = btn.dataset.tab;
    const content = document.getElementById(tabId);
    if (content) content.style.display = "block";

    if (tabId === "tab-keys") loadApiKeys();
    if (tabId === "tab-offers") loadRecentOffers();
  });
});

// ── Load and populate settings ───────────────────────────────────────────────

async function loadSettings() {
  try {
    const res = await fetch(`/api/v1/sites/settings?site_id=${siteId}`, {
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const site = data.site;

    const minVal = Number(site.min_cart_subtotal) || 300;
    const maxVal = Number(site.max_discount_percent) || 15;

    // Populate slider
    minCartSlider.value = Math.min(1000, Math.max(1, Math.round(minVal)));
    updateSliderDisplay(minCartSlider.value);

    // Populate max discount
    maxDiscount.value = maxVal;

    // Populate origins
    permittedOrigins.value = (site.permitted_origins || []).join(", ");

    // Record saved baseline
    savedMinCart = Number(minCartSlider.value);
    savedMaxDiscount = maxVal;
    unsavedIndicator.style.opacity = "0";
    sliderValueDisplay.classList.remove("changed");

    updateLivePreview();

    // Hide any prior error
    if (saveStatus && saveStatus.className.includes("bad")) {
      saveStatus.hidden = true;
    }
  } catch (err) {
    saveStatus.hidden = false;
    saveStatus.className = "status-callout bad";
    saveStatusTitle.textContent = "AUTHENTICATION REQUIRED";
    saveStatusText.textContent = `Could not load store settings: ${err.message}. Please verify the Admin Secret Key above.`;
  }
}

// ── Save settings ────────────────────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveStatus.hidden = true;

  const minCartVal = Number(minCartSlider.value);
  const maxDiscountVal = Number(maxDiscount.value);

  // Client-side boundary guards (server also validates)
  if (minCartVal < 1 || minCartVal > 1000) {
    saveStatus.hidden = false;
    saveStatus.className = "status-callout bad";
    saveStatusTitle.textContent = "VALIDATION ERROR";
    saveStatusText.textContent = "Minimum cart value must be between $1 and $1,000.";
    return;
  }
  if (maxDiscountVal < 0 || maxDiscountVal > 100) {
    saveStatus.hidden = false;
    saveStatus.className = "status-callout bad";
    saveStatusTitle.textContent = "VALIDATION ERROR";
    saveStatusText.textContent = "Maximum discount must be between 0% and 100%.";
    return;
  }

  const originsList = permittedOrigins.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const res = await fetch("/api/v1/sites/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        site_id: siteId,
        minCartSubtotal: minCartVal,
        maxDiscountPercent: maxDiscountVal,
        permittedOrigins: originsList,
      }),
    });

    const data = await res.json();
    saveStatus.hidden = false;

    if (!res.ok) {
      saveStatus.className = "status-callout bad";
      saveStatusTitle.textContent = "SAVE FAILED";
      saveStatusText.textContent = (data.errors || [data.error || "Could not save."]).join(" ");
      return;
    }

    saveStatus.className = "status-callout ok";
    saveStatusTitle.textContent = "RULES SAVED";
    saveStatusText.textContent = `Bargaining rules updated — minimum cart $${minCartVal}, max discount ${maxDiscountVal}%.`;

    // Update saved baseline
    savedMinCart = minCartVal;
    savedMaxDiscount = maxDiscountVal;
    unsavedIndicator.style.opacity = "0";
    sliderValueDisplay.classList.remove("changed");

    updateLivePreview();
  } catch (err) {
    saveStatus.hidden = false;
    saveStatus.className = "status-callout bad";
    saveStatusTitle.textContent = "NETWORK ERROR";
    saveStatusText.textContent = err.message;
  }
});

// ── API Keys ─────────────────────────────────────────────────────────────────

async function loadApiKeys() {
  keysTableBody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">Loading credentials...</td></tr>`;
  try {
    const res = await fetch(`/api/v1/keys?site_id=${siteId}`, { headers: getAuthHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load keys");

    if (data.keys.length === 0) {
      keysTableBody.innerHTML = `<tr><td colspan="5" style="color: var(--muted);">No API keys generated yet.</td></tr>`;
      return;
    }

    keysTableBody.innerHTML = data.keys
      .map(
        (k) => `
        <tr>
          <td><strong>${k.name}</strong></td>
          <td><code>${k.key_prefix}</code></td>
          <td>
            <span style="color: ${k.status === "active" ? "#10b981" : "#ef4444"}; text-transform: uppercase; font-family: var(--font-mono); font-size: 11px;">
              ${k.status}
            </span>
          </td>
          <td>${new Date(k.created_at).toLocaleDateString()}</td>
          <td>
            ${
              k.status === "active"
                ? `<button type="button" class="btn-secondary" style="height: 28px; padding: 0 12px; font-size: 10px;" onclick="revokeKey('${k.id}')">Revoke</button>`
                : `<span style="color: var(--muted); font-size: 11px;">Revoked</span>`
            }
          </td>
        </tr>
      `
      )
      .join("");
  } catch (err) {
    keysTableBody.innerHTML = `<tr><td colspan="5" style="color: #ef4444;">${err.message}</td></tr>`;
  }
}

btnGenerateKey.addEventListener("click", async () => {
  const name = prompt("Enter a description for this API key:", "Production Store Backend Key");
  if (!name) return;

  try {
    const res = await fetch("/api/v1/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ site_id: siteId, name }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create key");

    newKeyAlert.style.display = "block";
    newKeySecret.textContent = data.key.secret_key;
    loadApiKeys();
  } catch (err) {
    alert("Error creating key: " + err.message);
  }
});

window.revokeKey = async function (keyId) {
  if (!confirm(`Permanently revoke key ${keyId}? Servers using it will lose access immediately.`)) return;
  try {
    const res = await fetch(`/api/v1/keys/${keyId}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ site_id: siteId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to revoke key");
    loadApiKeys();
  } catch (err) {
    alert("Error revoking key: " + err.message);
  }
};

// ── Recent Offers ─────────────────────────────────────────────────────────────

async function loadRecentOffers() {
  offersTableBody.innerHTML = `<tr><td colspan="7" style="color: var(--muted);">Loading recent offers...</td></tr>`;
  try {
    const res = await fetch(`/api/v1/offers?site_id=${siteId}`, { headers: getAuthHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load offers");

    if (data.offers.length === 0) {
      offersTableBody.innerHTML = `<tr><td colspan="7" style="color: var(--muted);">No customer offers recorded yet.</td></tr>`;
      return;
    }

    offersTableBody.innerHTML = data.offers
      .map(
        (o) => `
        <tr>
          <td><code style="font-size: 11px;">${o.id}</code></td>
          <td class="money">${money(o.cart_subtotal)}</td>
          <td class="money" style="font-weight: 600;">${money(o.offered_total)}</td>
          <td class="money">${money(o.min_acceptable_cart)}</td>
          <td>
            <span style="color: ${o.status === "accepted" ? "#10b981" : o.status === "unavailable" ? "#f59e0b" : "#f87171"}; text-transform: uppercase; font-family: var(--font-mono); font-size: 11px;">
              ${o.status}
            </span>
          </td>
          <td>
            <span style="color: ${o.redeemed ? "var(--link)" : "var(--muted)"}; font-family: var(--font-mono); font-size: 11px;">
              ${o.redeemed ? "Yes" : "No"}
            </span>
          </td>
          <td style="font-size: 11px; color: var(--muted);">${new Date(o.created_at).toLocaleTimeString()}</td>
        </tr>
      `
      )
      .join("");
  } catch (err) {
    offersTableBody.innerHTML = `<tr><td colspan="7" style="color: #ef4444;">${err.message}</td></tr>`;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

btnSyncAuth.addEventListener("click", () => {
  loadSettings();
});

// Initial slider display (before settings load)
updateSliderDisplay(minCartSlider.value);
updateLivePreview();

// Load actual saved settings from backend
loadSettings();
