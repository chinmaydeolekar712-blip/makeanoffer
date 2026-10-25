/**
 * BargainOS Reference Adapter for Custom Ecommerce Websites
 * Demonstrates secure server-to-server integration:
 *
 * 1. Reads the customer's actual cart from server-side session or database.
 * 2. Transmits authoritative line items to BargainOS API with secret API key.
 * 3. Receives cryptographic offer approval.
 * 4. Verifies the offer and cart integrity at checkout before creating the order.
 * 5. Marks the offer as redeemed to prevent reuse.
 */
"use strict";

const express = require("express");
const app = express();
app.use(express.json());

// Configuration for your BargainOS connection
const BARGAINOS_URL = process.env.BARGAINOS_URL || "http://localhost:3000";
const BARGAINOS_API_KEY = process.env.BARGAINOS_API_KEY || "sk_live_demo_apex_wholesale_key_2026";
const BARGAINOS_SITE_ID = process.env.BARGAINOS_SITE_ID || "site_demo_wholesaler";

/**
 * Step 1: Mock server-side cart lookup.
 * In a real custom store, this reads from session, Redis, or database.
 * NEVER trust the client browser for unit prices or totals!
 */
function getServerCart(sessionId) {
  return [
    {
      id: "box-bundle-25",
      name: "Corrugated Shipping Cartons (Bundle of 25)",
      quantity: 2,
      unitPrice: 180.0,
      lineTotal: 360.0,
    },
    {
      id: "stretch-wrap-case",
      name: "Heavy-Duty Stretch Wrap Film (Case of 4)",
      quantity: 1,
      unitPrice: 120.0,
      lineTotal: 120.0,
    },
    {
      id: "kraft-tape-case",
      name: "Reinforced Water-Activated Kraft Tape (Case of 10)",
      quantity: 1,
      unitPrice: 65.0,
      lineTotal: 65.0,
    },
  ];
  // Subtotal: $545.00
}

/**
 * Step 2 & 3: Submit Customer Offer via Merchant Backend
 * The browser widget contacts this endpoint; your backend validates against BargainOS.
 */
app.post("/api/checkout/submit-offer", async (req, res) => {
  try {
    const { sessionId, proposedPrice } = req.body;
    const authoritativeCart = getServerCart(sessionId);
    const cartSubtotal = authoritativeCart.reduce((s, i) => s + i.lineTotal, 0);

    // Call BargainOS server-to-server endpoint
    const response = await fetch(`${BARGAINOS_URL}/api/v1/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BARGAINOS_API_KEY}`,
      },
      body: JSON.stringify({
        items: authoritativeCart,
        offeredTotal: Number(proposedPrice),
        currency: "USD",
      }),
    });

    const decision = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: decision.message || "Bargaining failed.",
      });
    }

    // Save offer_id in the customer's server session for checkout verification
    // req.session.approvedOfferId = decision.offer_id;

    res.json({
      ok: true,
      offerId: decision.offer_id,
      status: decision.status,
      accepted: decision.accepted,
      originalTotal: cartSubtotal,
      authorizedTotal: decision.offered_total,
      savings: decision.discount_amount,
      expiresAt: decision.expires_at,
      message: decision.message,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Step 4 & 5: Verify & Redeem Offer at Order Creation
 * When the customer clicks "Place Order", verify offer validity and redeem it.
 */
app.post("/api/checkout/place-order", async (req, res) => {
  try {
    const { sessionId, offerId, paymentDetails } = req.body;
    const currentCart = getServerCart(sessionId);

    let finalChargeAmount = currentCart.reduce((s, i) => s + i.lineTotal, 0);

    // If an approved offer was applied, verify and redeem it with BargainOS
    if (offerId) {
      // 1. Check offer status & validity
      const checkRes = await fetch(`${BARGAINOS_URL}/api/v1/offers/${offerId}`, {
        headers: { Authorization: `Bearer ${BARGAINOS_API_KEY}` },
      });
      const offer = await checkRes.json();

      if (!checkRes.ok || !offer.accepted || offer.redeemed || offer.is_expired) {
        return res.status(400).json({
          ok: false,
          error: "The negotiated price offer is invalid, expired, or has already been used.",
        });
      }

      // 2. Atomically redeem the offer with BargainOS, verifying the cart has not changed
      const redeemRes = await fetch(`${BARGAINOS_URL}/api/v1/offers/${offerId}/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BARGAINOS_API_KEY}`,
        },
        body: JSON.stringify({ items: currentCart }),
      });

      const redeemResult = await redeemRes.json();
      if (!redeemRes.ok) {
        return res.status(400).json({
          ok: false,
          error: `Could not apply negotiated discount: ${redeemResult.error}`,
        });
      }

      // Use the authorized negotiated price
      finalChargeAmount = redeemResult.authorized_final_total;
    }

    // Process actual payment (e.g. Stripe, Authorize.net) for finalChargeAmount
    // await paymentProcessor.charge({ amount: finalChargeAmount, ...paymentDetails });

    res.json({
      ok: true,
      orderId: `ord_${Date.now()}`,
      chargedAmount: finalChargeAmount,
      offerRedeemed: Boolean(offerId),
      message: "Order placed successfully with verified pricing.",
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.ADAPTER_PORT || 4000;
  app.listen(PORT, () => {
    console.log(`BargainOS Reference Adapter running at http://localhost:${PORT}`);
  });
}
