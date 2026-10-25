"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { app, db } = require("../server");

describe("Merchant Isolation & Multi-Tenancy", () => {
  it("isolates settings between independent merchant sites", () => {
    // Site A
    const siteA = db.getSiteById("site_demo_wholesaler");
    assert.equal(siteA.id, "site_demo_wholesaler");

    // Create Merchant B and Site B
    const merchantB = db.createMerchant({
      name: "Packaging Pro Midwest",
      email: `merchant_${Date.now()}@packagingpro.example.com`,
      adminToken: "secret_admin_midwest_123",
    });

    const siteB = db.createSite({
      merchantId: merchantB.id,
      name: "Midwest Packaging Hub",
      minCartSubtotal: 1000,
      maxDiscountPercent: 20,
      permittedOrigins: ["https://packagingpro.example.com"],
    });

    assert.equal(siteB.min_cart_subtotal, 1000);
    assert.equal(siteB.max_discount_percent, 20);

    // Update Site B without affecting Site A
    db.updateSiteSettings(siteB.id, { minCartSubtotal: 1200, maxDiscountPercent: 25 });

    const refetchedA = db.getSiteById("site_demo_wholesaler");
    const refetchedB = db.getSiteById(siteB.id);

    assert.equal(refetchedA.min_cart_subtotal, siteA.min_cart_subtotal);
    assert.equal(refetchedB.min_cart_subtotal, 1200);
    assert.equal(refetchedB.max_discount_percent, 25);
  });
});

describe("Cryptographic API Keys & Authentication", () => {
  it("generates, hashes, authenticates, and revokes API keys", () => {
    const keyData = db.createApiKey("site_demo_wholesaler", "Test Automation Key");
    assert.ok(keyData.secret_key.startsWith("sk_live_"));
    assert.ok(keyData.key_prefix);

    // Verify authentication succeeds with the plaintext key
    const authenticated = db.authenticateApiKey(keyData.secret_key);
    assert.ok(authenticated);
    assert.equal(authenticated.site_id, "site_demo_wholesaler");

    // Verify authentication fails with corrupted or wrong key
    assert.equal(db.authenticateApiKey("sk_live_wrong_invalid_key_12345"), null);

    // Verify key revocation
    const revoked = db.revokeApiKey(keyData.id, "site_demo_wholesaler");
    assert.equal(revoked, true);

    // Verify revoked key can no longer authenticate
    assert.equal(db.authenticateApiKey(keyData.secret_key), null);
  });
});

describe("Offer Lifecycle, Expiry & Single-Use Redemption", () => {
  it("enforces single-use redemption and cart hash integrity", () => {
    const lineItems = [
      { id: "box-25", name: "Boxes", quantity: 2, unitPrice: 180, lineTotal: 360 },
      { id: "film-4", name: "Film", quantity: 1, unitPrice: 150, lineTotal: 150 },
    ]; // Total = 510

    const offer = db.createOfferRecord({
      siteId: "site_demo_wholesaler",
      cartSubtotal: 510,
      offeredTotal: 450,
      minAcceptableCart: 433.5,
      discountAmount: 60,
      discountPercent: 11.76,
      status: "accepted",
      message: "Offer approved",
      items: lineItems,
      expiresInMinutes: 30,
    });

    assert.ok(offer.id.startsWith("off_"));
    assert.equal(offer.redeemed, false);

    // First redemption succeeds
    const redeem1 = db.redeemOffer(offer.id, "site_demo_wholesaler", lineItems);
    assert.equal(redeem1.ok, true);
    assert.equal(redeem1.authorized_final_total, 450);

    // Second redemption fails (prevents reuse)
    const redeem2 = db.redeemOffer(offer.id, "site_demo_wholesaler", lineItems);
    assert.equal(redeem2.ok, false);
    assert.match(redeem2.error, /already been redeemed/i);
  });

  it("blocks redemption if cart line items were tampered with", () => {
    const originalItems = [
      { id: "tape-10", name: "Tape", quantity: 5, unitPrice: 20, lineTotal: 100 },
    ];

    const offer = db.createOfferRecord({
      siteId: "site_demo_wholesaler",
      cartSubtotal: 500,
      offeredTotal: 450,
      minAcceptableCart: 425,
      discountAmount: 50,
      discountPercent: 10,
      status: "accepted",
      message: "Offer approved",
      items: originalItems,
      expiresInMinutes: 30,
    });

    // Tampered cart with different quantity
    const tamperedItems = [
      { id: "tape-10", name: "Tape", quantity: 10, unitPrice: 20, lineTotal: 200 },
    ];

    const result = db.redeemOffer(offer.id, "site_demo_wholesaler", tamperedItems);
    assert.equal(result.ok, false);
    assert.match(result.error, /changed since offer was approved/i);
  });
});
