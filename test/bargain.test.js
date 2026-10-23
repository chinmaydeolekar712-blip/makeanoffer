"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateSettings,
  normalizeLineItems,
  evaluateOffer,
  minimumAcceptableEligible,
} = require("../lib/bargain");

const settings = {
  minCartSubtotal: 250,
  maxDiscountPercent: 15,
  excludedProductIds: [],
};

const eligible300 = [
  { id: "a", name: "A", quantity: 1, unitPrice: 180, lineTotal: 180 },
  { id: "b", name: "B", quantity: 1, unitPrice: 120, lineTotal: 120 },
];

describe("validateSettings", () => {
  it("accepts defaults", () => {
    const result = validateSettings(settings);
    assert.equal(result.ok, true);
    assert.equal(result.settings.maxDiscountPercent, 15);
  });

  it("rejects negative and excessive values", () => {
    assert.equal(validateSettings({ minCartSubtotal: -1, maxDiscountPercent: 15 }).ok, false);
    assert.equal(validateSettings({ minCartSubtotal: 250, maxDiscountPercent: -5 }).ok, false);
    assert.equal(validateSettings({ minCartSubtotal: 250, maxDiscountPercent: 150 }).ok, false);
    assert.equal(validateSettings({ minCartSubtotal: "abc", maxDiscountPercent: 15 }).ok, false);
    assert.equal(validateSettings({ minCartSubtotal: 250, maxDiscountPercent: Infinity }).ok, false);
  });
});

describe("spec example: $300 eligible, 15% max discount", () => {
  it("computes a $255 floor", () => {
    assert.equal(minimumAcceptableEligible(300, 15), 255);
  });

  it("accepts offers of $255 or more", () => {
    const accepted = evaluateOffer({
      settings,
      lines: eligible300,
      offeredTotal: 255,
    });
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.accepted, true);

    const above = evaluateOffer({
      settings,
      lines: eligible300,
      offeredTotal: 280,
    });
    assert.equal(above.status, "accepted");
  });

  it("rejects offers below $255", () => {
    const rejected = evaluateOffer({
      settings,
      lines: eligible300,
      offeredTotal: 254.99,
    });
    assert.equal(rejected.status, "rejected");
    assert.match(rejected.message, /too low/i);
  });
});

describe("exclusions and threshold", () => {
  it("requires excluded items to be paid in full", () => {
    const withExcluded = evaluateOffer({
      settings: { ...settings, excludedProductIds: ["gift"] },
      lines: [
        ...eligible300,
        { id: "gift", name: "Gift", quantity: 1, unitPrice: 40, lineTotal: 40 },
      ],
      offeredTotal: 255,
    });
    assert.equal(withExcluded.status, "rejected");
    assert.equal(withExcluded.minAcceptableCart, 295);

    const ok = evaluateOffer({
      settings: { ...settings, excludedProductIds: ["gift"] },
      lines: [
        ...eligible300,
        { id: "gift", name: "Gift", quantity: 1, unitPrice: 40, lineTotal: 40 },
      ],
      offeredTotal: 295,
    });
    assert.equal(ok.status, "accepted");
  });

  it("blocks bargaining below the minimum cart threshold", () => {
    const result = evaluateOffer({
      settings,
      lines: [{ id: "a", name: "A", quantity: 1, unitPrice: 100, lineTotal: 100 }],
      offeredTotal: 90,
    });
    assert.equal(result.status, "unavailable");
  });

  it("rejects invalid and negative offers", () => {
    assert.equal(
      evaluateOffer({ settings, lines: eligible300, offeredTotal: "nope" }).status,
      "invalid"
    );
    assert.equal(
      evaluateOffer({ settings, lines: eligible300, offeredTotal: -10 }).status,
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

    const omitted = normalizeLineItems(
      [
        { id: "oak-desk", quantity: 0 },
        { id: "oak-desk", quantity: 1 },
      ],
      catalog
    );
    assert.equal(omitted.ok, true);
    assert.equal(omitted.lines.length, 1);

    const badQty = normalizeLineItems([{ id: "oak-desk", quantity: -1 }], catalog);
    assert.equal(badQty.ok, false);
  });
});
