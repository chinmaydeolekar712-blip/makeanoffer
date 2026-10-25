/**
 * BargainOS Embeddable Widget v1.0
 * Automated Cart Bargaining for Online Wholesalers
 *
 * Usage:
 * <script src="https://YOUR-BARGAINOS-DOMAIN/widget.js" data-site-id="site_demo_wholesaler" defer></script>
 *
 * Optional Container:
 * <div id="bargainos-widget-container" data-cart-total="650.00"></div>
 */
(function (window, document) {
  "use strict";

  // Prevent multiple initializations
  if (window.BargainOSWidgetInitialized) return;
  window.BargainOSWidgetInitialized = true;

  // Determine current script tag and site ID
  const currentScript =
    document.currentScript ||
    document.querySelector('script[src*="widget.js"]') ||
    document.querySelector("script[data-site-id]");

  const siteId =
    (currentScript && currentScript.getAttribute("data-site-id")) ||
    window.BARGAINOS_SITE_ID ||
    "site_demo_wholesaler";

  const hostUrl = currentScript
    ? new URL(currentScript.src, window.location.href).origin
    : window.location.origin;

  let siteConfig = null;
  let currentCartTotal = 0;
  let onOfferSubmitCallback = null;

  // Fetch safe public configuration for this site
  async function fetchConfig() {
    try {
      const res = await fetch(`${hostUrl}/api/v1/public/config?site_id=${encodeURIComponent(siteId)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to load widget config: HTTP ${res.status}`);
      }
      siteConfig = await res.json();
      return siteConfig;
    } catch (e) {
      console.warn("[BargainOS Widget] Configuration load error:", e.message);
      // Fallback safe defaults if offline/unreachable
      siteConfig = {
        site_id: siteId,
        site_name: "Wholesale Store",
        currency: "USD",
        min_cart_subtotal: 500,
        max_discount_percent: 15,
      };
      return siteConfig;
    }
  }

  // Inject scoped styles for widget
  function injectStyles() {
    if (document.getElementById("bargainos-widget-styles")) return;
    const style = document.createElement("style");
    style.id = "bargainos-widget-styles";
    style.textContent = `
      .bos-widget-root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        box-sizing: border-box;
        margin: 16px 0;
      }
      .bos-widget-root * {
        box-sizing: border-box;
      }
      .bos-banner {
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .bos-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }
      .bos-title {
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #94a3b8;
      }
      .bos-badge {
        font-size: 11px;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 9999px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .bos-badge.locked {
        background: rgba(217, 119, 6, 0.2);
        color: #f59e0b;
        border: 1px solid #d97706;
      }
      .bos-badge.unlocked {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
        border: 1px solid #10b981;
      }
      .bos-progress-track {
        width: 100%;
        height: 4px;
        background: #1e293b;
        border-radius: 2px;
        overflow: hidden;
      }
      .bos-progress-bar {
        height: 100%;
        width: 0%;
        background: #f59e0b;
        transition: width 0.3s ease, background-color 0.3s ease;
      }
      .bos-progress-bar.unlocked {
        background: #10b981;
      }
      .bos-info-text {
        font-size: 13px;
        color: #cbd5e1;
        line-height: 1.4;
      }
      .bos-trigger-btn {
        width: 100%;
        height: 42px;
        background: transparent;
        color: #ffffff;
        border: 1px solid #ffffff;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .bos-trigger-btn:hover:not(:disabled) {
        background: #ffffff;
        color: #0f172a;
      }
      .bos-trigger-btn:disabled {
        border-color: #475569;
        color: #64748b;
        cursor: not-allowed;
      }
      /* Modal Styles */
      .bos-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        z-index: 999999;
      }
      .bos-modal-backdrop.open {
        display: flex;
      }
      .bos-modal-card {
        background: #141414;
        color: #ffffff;
        border: 1px solid #262626;
        width: min(460px, 100%);
        padding: 32px 28px;
        border-radius: 4px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      }
      .bos-modal-card h3 {
        margin: 0 0 8px;
        font-size: 20px;
        letter-spacing: 1px;
        text-transform: uppercase;
        font-weight: 600;
      }
      .bos-modal-card p {
        margin: 0 0 20px;
        font-size: 14px;
        color: #94a3b8;
        line-height: 1.4;
      }
      .bos-quick-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 20px;
      }
      .bos-quick-btn {
        background: transparent;
        border: 1px solid #3a3a3a;
        color: #ffffff;
        padding: 8px 6px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        transition: all 0.2s;
      }
      .bos-quick-btn:hover {
        border-color: #ffffff;
        background: rgba(255, 255, 255, 0.05);
      }
      .bos-input-group {
        margin-bottom: 24px;
      }
      .bos-input-label {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #94a3b8;
        margin-bottom: 8px;
      }
      .bos-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .bos-currency-tag {
        position: absolute;
        left: 0;
        font-size: 18px;
        color: #94a3b8;
      }
      .bos-offer-input {
        width: 100%;
        background: transparent;
        border: 0;
        border-bottom: 1px solid #3a3a3a;
        padding: 10px 0 10px 24px;
        color: #ffffff;
        font-size: 20px;
        font-weight: 600;
      }
      .bos-offer-input:focus {
        outline: none;
        border-bottom-color: #ffffff;
      }
      .bos-modal-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .bos-btn-cancel {
        background: transparent;
        border: 1px solid #334155;
        color: #94a3b8;
        border-radius: 9999px;
        height: 40px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        cursor: pointer;
      }
      .bos-btn-cancel:hover {
        color: #ffffff;
        border-color: #64748b;
      }
      .bos-result-box {
        margin-top: 16px;
        padding: 12px 14px;
        font-size: 13px;
        line-height: 1.4;
        border-radius: 4px;
      }
      .bos-result-box.ok {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid #10b981;
        color: #34d399;
      }
      .bos-result-box.bad {
        background: rgba(225, 29, 72, 0.1);
        border: 1px solid #f43f5e;
        color: #fb7185;
      }
      .bos-result-box.warn {
        background: rgba(217, 119, 6, 0.1);
        border: 1px solid #f59e0b;
        color: #fbbf24;
      }
    `;
    document.head.appendChild(style);
  }

  // Create or update widget DOM
  function renderWidget(container, cartTotal) {
    currentCartTotal = Number(cartTotal || 0);
    const minThreshold = siteConfig ? siteConfig.min_cart_subtotal : 500;
    const isUnlocked = currentCartTotal >= minThreshold;
    const diff = Math.max(0, minThreshold - currentCartTotal);
    const pct = minThreshold > 0 ? Math.min(100, Math.round((currentCartTotal / minThreshold) * 100)) : 100;

    container.innerHTML = `
      <div class="bos-widget-root">
        <div class="bos-banner">
          <div class="bos-header">
            <span class="bos-title">BargainOS &bull; Bulk Cart Negotiation</span>
            <span class="bos-badge ${isUnlocked ? "unlocked" : "locked"}">
              ${isUnlocked ? "Unlocked" : "Locked"}
            </span>
          </div>

          <div class="bos-progress-track">
            <div class="bos-progress-bar ${isUnlocked ? "unlocked" : ""}" style="width: ${pct}%"></div>
          </div>

          <div class="bos-info-text">
            ${
              isUnlocked
                ? `Cart total ($${currentCartTotal.toFixed(2)}) meets the wholesale bargaining minimum ($${minThreshold.toFixed(2)}). You are qualified to propose a bulk order price.`
                : `Add $${diff.toFixed(2)} more to reach the $${minThreshold.toFixed(2)} wholesale minimum and unlock automated price bargaining.`
            }
          </div>

          <button type="button" class="bos-trigger-btn" id="bos-make-offer-btn" ${!isUnlocked ? "disabled" : ""}>
            ${isUnlocked ? "Make an Offer on Cart" : `Locked (Min $${minThreshold.toFixed(2)})`}
          </button>
        </div>
      </div>
    `;

    const btn = container.querySelector("#bos-make-offer-btn");
    if (btn) {
      btn.addEventListener("click", () => openModal(currentCartTotal));
    }
  }

  // Modal setup
  let modalBackdrop = null;

  function ensureModal() {
    if (modalBackdrop) return modalBackdrop;

    modalBackdrop = document.createElement("div");
    modalBackdrop.className = "bos-modal-backdrop";
    modalBackdrop.innerHTML = `
      <div class="bos-modal-card">
        <h3>Propose Cart Valuation</h3>
        <p>Submit your proposed wholesale total for this order. Evaluated instantly against merchant rules.</p>

        <div style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">
          Current Cart Total: <strong style="color: #ffffff;" id="bos-modal-total">$0.00</strong>
        </div>

        <div class="bos-quick-grid" id="bos-quick-chips">
          <button type="button" class="bos-quick-btn" data-pct="5">5% Off</button>
          <button type="button" class="bos-quick-btn" data-pct="10">10% Off</button>
          <button type="button" class="bos-quick-btn" data-pct="15">15% Off</button>
        </div>

        <div class="bos-input-group">
          <label class="bos-input-label">Proposed Total Price ($)</label>
          <div class="bos-input-wrap">
            <span class="bos-currency-tag">$</span>
            <input type="number" step="0.01" min="0" class="bos-offer-input" id="bos-offer-val" placeholder="0.00" />
          </div>
          <div id="bos-savings-calc" style="font-size: 12px; color: #10b981; margin-top: 6px; min-height: 16px;"></div>
        </div>

        <div id="bos-modal-result" style="display: none;"></div>

        <div class="bos-modal-actions">
          <button type="button" class="bos-btn-cancel" id="bos-modal-cancel">Cancel</button>
          <button type="button" class="bos-trigger-btn" id="bos-modal-submit">Submit Offer</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    // Cancel handler
    modalBackdrop.querySelector("#bos-modal-cancel").addEventListener("click", () => {
      modalBackdrop.classList.remove("open");
    });

    // Quick chips
    modalBackdrop.querySelector("#bos-quick-chips").addEventListener("click", (e) => {
      const b = e.target.closest(".bos-quick-btn");
      if (!b) return;
      const pct = Number(b.dataset.pct);
      const discounted = Math.round(currentCartTotal * (1 - pct / 100) * 100) / 100;
      modalBackdrop.querySelector("#bos-offer-val").value = discounted.toFixed(2);
      updateSavingsNote(discounted);
    });

    const inputVal = modalBackdrop.querySelector("#bos-offer-val");
    inputVal.addEventListener("input", () => {
      updateSavingsNote(Number(inputVal.value));
    });

    // Submit handler
    modalBackdrop.querySelector("#bos-modal-submit").addEventListener("click", handleOfferSubmit);

    return modalBackdrop;
  }

  function updateSavingsNote(offered) {
    const noteEl = document.getElementById("bos-savings-calc");
    if (!noteEl) return;
    if (offered && offered > 0 && currentCartTotal > 0 && offered < currentCartTotal) {
      const diff = currentCartTotal - offered;
      const pct = ((diff / currentCartTotal) * 100).toFixed(1);
      noteEl.textContent = `You save $${diff.toFixed(2)} (${pct}% discount)`;
    } else {
      noteEl.textContent = "";
    }
  }

  function openModal(cartTotal) {
    ensureModal();
    currentCartTotal = cartTotal;
    const totalEl = modalBackdrop.querySelector("#bos-modal-total");
    const inputVal = modalBackdrop.querySelector("#bos-offer-val");
    const resultBox = modalBackdrop.querySelector("#bos-modal-result");

    totalEl.textContent = `$${cartTotal.toFixed(2)}`;
    // Pre-populate with 10% discount suggestion
    const defaultOffer = Math.round(cartTotal * 0.9 * 100) / 100;
    inputVal.value = defaultOffer.toFixed(2);
    resultBox.style.display = "none";
    updateSavingsNote(defaultOffer);

    modalBackdrop.classList.add("open");
    inputVal.focus();
  }

  async function handleOfferSubmit() {
    const inputVal = modalBackdrop.querySelector("#bos-offer-val");
    const resultBox = modalBackdrop.querySelector("#bos-modal-result");
    const submitBtn = modalBackdrop.querySelector("#bos-modal-submit");
    const offered = Number(inputVal.value);

    if (!offered || offered <= 0) {
      resultBox.style.display = "block";
      resultBox.className = "bos-result-box bad";
      resultBox.textContent = "Please enter a valid positive offer amount.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Evaluating...";

    try {
      // If the host website has registered an authoritative offer submission handler
      if (typeof onOfferSubmitCallback === "function") {
        const decision = await onOfferSubmitCallback({
          siteId,
          cartTotal: currentCartTotal,
          offeredTotal: offered,
        });
        displayResult(decision);
        return;
      }

      // Default: dispatch custom event for custom site backend integration
      const customEvent = new CustomEvent("bargainos:offer-submitted", {
        detail: {
          siteId,
          cartTotal: currentCartTotal,
          offeredTotal: offered,
          resolve: (decision) => displayResult(decision),
          reject: (err) => displayResult({ accepted: false, message: err.message || "Offer failed." }),
        },
      });
      window.dispatchEvent(customEvent);

      // Also fallback to direct client-safe prototype endpoint if merchant adapter is not plugged in
      const res = await fetch(`${hostUrl}/api/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offeredTotal: offered,
          items: window.BargainOSGetCartItems ? window.BargainOSGetCartItems() : [
            { id: "wholesale-order", name: "Wholesale Cart Order", quantity: 1, unitPrice: currentCartTotal }
          ],
        }),
      });

      const decision = await res.json();
      displayResult(decision);
    } catch (err) {
      displayResult({ accepted: false, message: err.message || "Failed to communicate with bargaining server." });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Offer";
    }
  }

  function displayResult(decision) {
    const resultBox = modalBackdrop.querySelector("#bos-modal-result");
    resultBox.style.display = "block";
    const isOk = decision.accepted === true;
    resultBox.className = `bos-result-box ${isOk ? "ok" : decision.status === "unavailable" ? "warn" : "bad"}`;
    resultBox.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 2px;">
        ${isOk ? "Offer Accepted!" : "Offer Declined"}
      </div>
      <div>${decision.message || (isOk ? "Your price has been accepted." : "Offer was below floor.")}</div>
      ${decision.id ? `<div style="font-size: 11px; margin-top: 6px; opacity: 0.8;">Offer Ref: ${decision.id}</div>` : ""}
    `;

    // Emit event to notify host application
    window.dispatchEvent(
      new CustomEvent(isOk ? "bargainos:offer-accepted" : "bargainos:offer-rejected", {
        detail: decision,
      })
    );
  }

  // Public BargainOS Global API for host sites
  window.BargainOS = {
    version: "1.0.0",
    siteId,
    init: async function (options = {}) {
      if (options.siteId) {
        siteConfig = null; // force reload
      }
      injectStyles();
      await fetchConfig();

      const container =
        (options.containerId && document.getElementById(options.containerId)) ||
        document.getElementById("bargainos-widget-container");

      const total = options.cartTotal != null
        ? Number(options.cartTotal)
        : container && container.dataset.cartTotal
        ? Number(container.dataset.cartTotal)
        : 540.0;

      if (container) {
        renderWidget(container, total);
      }

      if (options.onOfferSubmit) {
        onOfferSubmitCallback = options.onOfferSubmit;
      }
    },
    updateCartTotal: function (newTotal) {
      const container = document.getElementById("bargainos-widget-container");
      if (container) {
        renderWidget(container, newTotal);
      }
    },
    openOfferModal: function (cartTotal) {
      openModal(Number(cartTotal || currentCartTotal));
    },
    getConfig: function () {
      return siteConfig;
    },
  };

  // Auto-init on DOMContentLoaded if container or script present
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.BargainOS.init());
  } else {
    window.BargainOS.init();
  }
})(window, document);
