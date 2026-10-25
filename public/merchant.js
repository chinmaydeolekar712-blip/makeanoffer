"use strict";

const siteId = "site_demo_wholesaler";
const adminInput = document.getElementById("admin-secret-input");
const btnSyncAuth = document.getElementById("btn-sync-auth");

const form = document.getElementById("settings-form");
const minCart = document.getElementById("min-cart");
const maxDiscount = document.getElementById("max-discount");
const permittedOrigins = document.getElementById("permitted-origins");

const saveStatus = document.getElementById("save-status");
const saveStatusTitle = document.getElementById("save-status-title");
const saveStatusText = document.getElementById("save-status-text");

const prevThreshold = document.getElementById("prev-threshold");
const prevDiscount = document.getElementById("prev-discount");
const prevSampleCart = document.getElementById("prev-sample-cart");
const prevStatus = document.getElementById("prev-status");
const prevFloor = document.getElementById("prev-floor");

const keysTableBody = document.getElementById("keys-table-body");
const btnGenerateKey = document.getElementById("btn-generate-key");
const newKeyAlert = document.getElementById("new-key-alert");
const newKeySecret = document.getElementById("new-key-secret");
const offersTableBody = document.getElementById("offers-table-body");

function getAuthHeader() {
  const secret = (adminInput.value || "").trim();
  return { Authorization: `Bearer ${secret}` };
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

// Tab navigation
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

function renderPreview(site) {
  prevThreshold.textContent = money(site.min_cart_subtotal);
  prevDiscount.textContent = `${site.max_discount_percent}%`;
  prevSampleCart.textContent = "$540.00";

  const isUnlocked = 540.0 >= site.min_cart_subtotal;
  if (isUnlocked) {
    prevStatus.innerHTML = `<span style="color: var(--success); font-family: var(--font-mono);">UNLOCKED</span>`;
  } else {
    prevStatus.innerHTML = `<span style="color: var(--warning); font-family: var(--font-mono);">LOCKED</span>`;
  }

  const floor = Math.round(540.0 * (1 - site.max_discount_percent / 100) * 100) / 100;
  prevFloor.textContent = money(floor);
}

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
    minCart.value = data.site.min_cart_subtotal;
    maxDiscount.value = data.site.max_discount_percent;
    permittedOrigins.value = (data.site.permitted_origins || []).join(", ");
    renderPreview(data.site);
  } catch (err) {
    saveStatus.hidden = false;
    saveStatus.className = "status-callout bad";
    saveStatusTitle.textContent = "AUTHENTICATION REQUIRED";
    saveStatusText.textContent = `Could not load store settings: ${err.message}. Please verify the Admin Secret Key above.`;
  }
}

// Save settings handler
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveStatus.hidden = true;

  try {
    const originsList = permittedOrigins.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch("/api/v1/sites/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({
        site_id: siteId,
        minCartSubtotal: Number(minCart.value),
        maxDiscountPercent: Number(maxDiscount.value),
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
    saveStatusTitle.textContent = "PROTOCOL SYNCHRONIZED";
    saveStatusText.textContent = "Pricing rules and permitted domains saved to SQLite database.";
    renderPreview(data.site);
  } catch (err) {
    saveStatus.hidden = false;
    saveStatus.className = "status-callout bad";
    saveStatusTitle.textContent = "NETWORK ERROR";
    saveStatusText.textContent = err.message;
  }
});

// Load API Keys
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
      .map((k) => `
        <tr>
          <td><strong>${k.name}</strong></td>
          <td><code>${k.key_prefix}</code></td>
          <td>
            <span style="color: ${k.status === "active" ? "#10b981" : "#ef4444"}; text-transform: uppercase;">
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
      `)
      .join("");
  } catch (err) {
    keysTableBody.innerHTML = `<tr><td colspan="5" style="color: #ef4444;">${err.message}</td></tr>`;
  }
}

// Generate new key
btnGenerateKey.addEventListener("click", async () => {
  const name = prompt("Enter a description for this API key:", "Production Store Backend Key");
  if (!name) return;

  try {
    const res = await fetch("/api/v1/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
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

// Revoke key
window.revokeKey = async function (keyId) {
  if (!confirm(`Are you sure you want to permanently revoke key ${keyId}? Any server using it will lose access immediately.`)) {
    return;
  }
  try {
    const res = await fetch(`/api/v1/keys/${keyId}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify({ site_id: siteId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to revoke key");
    loadApiKeys();
  } catch (err) {
    alert("Error revoking key: " + err.message);
  }
};

// Load Recent Offers Log
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
      .map((o) => `
        <tr>
          <td><code>${o.id}</code></td>
          <td class="money">${money(o.cart_subtotal)}</td>
          <td class="money" style="font-weight: 600;">${money(o.offered_total)}</td>
          <td class="money">${money(o.min_acceptable_cart)}</td>
          <td>
            <span style="color: ${o.status === "accepted" ? "#10b981" : "#f59e0b"}; text-transform: uppercase;">
              ${o.status}
            </span>
          </td>
          <td>
            <span style="color: ${o.redeemed ? "#60a5fa" : "var(--muted);"}">
              ${o.redeemed ? "Yes" : "No"}
            </span>
          </td>
          <td style="font-size: 11px;">${new Date(o.created_at).toLocaleTimeString()}</td>
        </tr>
      `)
      .join("");
  } catch (err) {
    offersTableBody.innerHTML = `<tr><td colspan="7" style="color: #ef4444;">${err.message}</td></tr>`;
  }
}

btnSyncAuth.addEventListener("click", () => {
  loadSettings();
});

loadSettings();
