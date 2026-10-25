"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateSettings,
  normalizeLineItems,
  evaluateOffer,
  minimumAcceptableCart,
} = require("../lib/bargain");

const sellerSettings500 = {
  minCartSubtotal: 500,
  maxDiscountPercent: 15,
};

const cart540 = [
  { id: "oak-desk", name: "Desk", quantity: 1, unitPrice: 180, lineTotal: 180 },
  { id: "wool-chair", name: "Chair", quantity: 1, unitPrice: 120, lineTotal: 120 },
  { id: "linen-lamp", name: "Lamp", quantity: 1, unitPrice: 65, lineTotal: 65 },
  { id: "ceramic-set", name: "Dinner Set", quantity: 1, unitPrice: 90, lineTotal: 90 },
  { id: "gift-card", name: "Gift Card", quantity: 1, unitPrice: 50, lineTotal: 50 },
  { id: "sale-vase", name: "Vase", quantity: 1, unitPrice: 35, lineTotal: 35 },
]; // total = 540

const cart300 = [
  { id: "oak-desk", name: "Desk", quantity: 1, unitPrice: 180, lineTotal: 180 },
  { id: "wool-chair", name: "Chair", quantity: 1, unitPrice: 120, lineTotal: 120 },
]; // total = 300

describe("validateSettings", () => {
  it("accepts valid seller settings", () => {
    const result = validateSettings(sellerSettings500);
    assert.equal(result.ok, true);
    assert.equal(result.settings.minCartSubtotal, 500);
    assert.equal(result.settings.maxDiscountPercent, 15);
  });

  it("rejects negative and excessive values", () => {
    assert.equal(validateSettings({ minCartSubtotal: -1, maxDiscountPercent: 15 }).ok, false);
    assert.equal(validateSettings({ minCartSubtotal: 500, maxDiscountPercent: -5 }).ok, false);
    assert.equal(validateSettings({ minCartSubtotal: 500, maxDiscountPercent: 105 }).ok, false);
    assert.equal(validateSettings({ minCartSubtotal: "abc", maxDiscountPercent: 15 }).ok, false);
  });
});

describe("minimum cart value threshold ($500 seller rule)", () => {
  it("locks bargaining when cart total is below the $500 threshold", () => {
    const result = evaluateOffer({
      settings: sellerSettings500,
      lines: cart300, // $300 < $500
      offeredTotal: 270,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.accepted, false);
    assert.equal(result.cartSubtotal, 300);
    assert.equal(result.neededToUnlock, 200);
    assert.match(result.message, /minimum cart value of \$500\.00/i);
  });

  it("unlocks bargaining when cart total meets or exceeds $500", () => {
    // 15% discount on $540 = $459 floor
    assert.equal(minimumAcceptableCart(540, 15), 459);

    const accepted = evaluateOffer({
      settings: sellerSettings500,
      lines: cart540, // $540 >= $500
      offeredTotal: 470,
    });
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.savings, 70);

    const exactFloor = evaluateOffer({
      settings: sellerSettings500,
      lines: cart540,
      offeredTotal: 459,
    });
    assert.equal(exactFloor.status, "accepted");
    assert.equal(exactFloor.savings, 81);
  });

  it("rejects offers below the seller discount floor", () => {
    const rejected = evaluateOffer({
      settings: sellerSettings500,
      lines: cart540,
      offeredTotal: 450, // below $459 floor
    });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.minAcceptableCart, 459);
    assert.match(rejected.message, /below the seller's minimum acceptable total/i);
  });

  it("rejects invalid and negative offers", () => {
    assert.equal(
      evaluateOffer({ settings: sellerSettings500, lines: cart540, offeredTotal: "invalid" }).status,
      "invalid"
    );
    assert.equal(
      evaluateOffer({ settings: sellerSettings500, lines: cart540, offeredTotal: -20 }).status,
      "invalid"
    );
  });
});

describe("normalizeLineItems", () => {
  it("uses catalog prices and rejects bad quantities", () => {
    const catalog = (id) =>
      id === "oak-desk" ? { id, name: "Desk", unitPrice: 180 } : null;
    const ok = normalizeLineItems([{ id: "oak-desk", quantity: 2, unitPrice: 1 }], catalog);
    assert.equal(ok.ok, true);
    assert.equal(ok.lines[0].lineTotal, 360);

    const omittedZero = normalizeLineItems(
      [
        { id: "oak-desk", quantity: 0 },
        { id: "oak-desk", quantity: 1 },
      ],
      catalog
    );
    assert.equal(omittedZero.ok, true);
    assert.equal(omittedZero.lines.length, 1);

    const badQty = normalizeLineItems([{ id: "oak-desk", quantity: -1 }], catalog);
    assert.equal(badQty.ok, false);
  });
});
