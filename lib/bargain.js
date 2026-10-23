"use strict";

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseMoney(value) {
  if (typeof value === "number") {
    return isFiniteNumber(value) ? value : NaN;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function validateSettings(raw) {
  const errors = [];
  const minCartSubtotal = parseMoney(raw && raw.minCartSubtotal);
  const maxDiscountPercent = parseMoney(raw && raw.maxDiscountPercent);

  if (!Number.isFinite(minCartSubtotal)) {
    errors.push("Minimum cart subtotal must be a valid number.");
  } else if (minCartSubtotal < 0) {
    errors.push("Minimum cart subtotal cannot be negative.");
  }

  if (!Number.isFinite(maxDiscountPercent)) {
    errors.push("Maximum discount percentage must be a valid number.");
  } else if (maxDiscountPercent < 0) {
    errors.push("Maximum discount percentage cannot be negative.");
  } else if (maxDiscountPercent > 100) {
    errors.push("Maximum discount percentage cannot exceed 100.");
  }

  const excludedProductIds = Array.isArray(raw && raw.excludedProductIds)
    ? [...new Set(raw.excludedProductIds.map(String))]
    : [];

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    settings: {
      minCartSubtotal: roundMoney(minCartSubtotal),
      maxDiscountPercent: roundMoney(maxDiscountPercent),
      excludedProductIds,
    },
  };
}

function normalizeLineItems(items, catalogLookup) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Cart must contain at least one product." };
  }

  const lines = [];
  for (const item of items) {
    const id = item && item.id != null ? String(item.id) : "";
    const product = catalogLookup ? catalogLookup(id) : item;
    if (!id || !product) {
      return { ok: false, error: `Unknown product: ${id || "(missing id)"}.` };
    }

    const qty = parseMoney(item.quantity);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      return {
        ok: false,
        error: `Quantity for ${product.name || id} must be a whole number of 0 or more.`,
      };
    }
    if (qty === 0) continue;

    const unitPrice =
      catalogLookup && product.unitPrice != null
        ? Number(product.unitPrice)
        : parseMoney(item.unitPrice);

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, error: `Invalid unit price for ${product.name || id}.` };
    }

    const lineTotal = roundMoney(unitPrice * qty);
    lines.push({
      id,
      name: product.name || id,
      quantity: qty,
      unitPrice: roundMoney(unitPrice),
      lineTotal,
    });
  }

  if (lines.length === 0) {
    return { ok: false, error: "Cart must contain at least one product." };
  }

  return { ok: true, lines };
}

function summarizeCart(lines, excludedProductIds) {
  const excluded = new Set(excludedProductIds || []);
  let eligibleSubtotal = 0;
  let excludedSubtotal = 0;

  const annotated = lines.map((line) => {
    const isExcluded = excluded.has(line.id);
    if (isExcluded) {
      excludedSubtotal += line.lineTotal;
    } else {
      eligibleSubtotal += line.lineTotal;
    }
    return { ...line, excluded: isExcluded };
  });

  eligibleSubtotal = roundMoney(eligibleSubtotal);
  excludedSubtotal = roundMoney(excludedSubtotal);

  return {
    lines: annotated,
    eligibleSubtotal,
    excludedSubtotal,
    cartSubtotal: roundMoney(eligibleSubtotal + excludedSubtotal),
  };
}

function minimumAcceptableEligible(eligibleSubtotal, maxDiscountPercent) {
  return roundMoney(eligibleSubtotal * (1 - maxDiscountPercent / 100));
}

function evaluateOffer({ settings, lines, offeredTotal }) {
  const settingsResult = validateSettings(settings);
  if (!settingsResult.ok) {
    return {
      status: "invalid",
      accepted: false,
      errors: settingsResult.errors,
      message: settingsResult.errors.join(" "),
    };
  }

  const { minCartSubtotal, maxDiscountPercent, excludedProductIds } =
    settingsResult.settings;
  const summary = summarizeCart(lines, excludedProductIds);
  const minAcceptableEligible = minimumAcceptableEligible(
    summary.eligibleSubtotal,
    maxDiscountPercent
  );
  const minAcceptableCart = roundMoney(
    minAcceptableEligible + summary.excludedSubtotal
  );

  const offer = parseMoney(offeredTotal);
  if (!Number.isFinite(offer)) {
    return {
      status: "invalid",
      accepted: false,
      ...summary,
      minAcceptableEligible,
      minAcceptableCart,
      message: "Offer amount must be a valid number.",
    };
  }
  if (offer < 0) {
    return {
      status: "invalid",
      accepted: false,
      ...summary,
      offeredTotal: offer,
      minAcceptableEligible,
      minAcceptableCart,
      message: "Offer amount cannot be negative.",
    };
  }

  const offered = roundMoney(offer);

  if (summary.eligibleSubtotal < minCartSubtotal) {
    return {
      status: "unavailable",
      accepted: false,
      ...summary,
      offeredTotal: offered,
      minAcceptableEligible,
      minAcceptableCart,
      minCartSubtotal,
      maxDiscountPercent,
      message: `Bargaining is available only when the eligible cart subtotal is at least $${minCartSubtotal.toFixed(2)}. Eligible items currently total $${summary.eligibleSubtotal.toFixed(2)}.`,
    };
  }

  if (offered < summary.excludedSubtotal) {
    return {
      status: "rejected",
      accepted: false,
      ...summary,
      offeredTotal: offered,
      minAcceptableEligible,
      minAcceptableCart,
      minCartSubtotal,
      maxDiscountPercent,
      message: `This offer cannot cover excluded items, which must be paid in full ($${summary.excludedSubtotal.toFixed(2)}).`,
    };
  }

  const amountTowardEligible = roundMoney(offered - summary.excludedSubtotal);

  if (amountTowardEligible + 0.0001 >= minAcceptableEligible) {
    const savings = roundMoney(summary.cartSubtotal - offered);
    return {
      status: "accepted",
      accepted: true,
      ...summary,
      offeredTotal: offered,
      amountTowardEligible,
      minAcceptableEligible,
      minAcceptableCart,
      minCartSubtotal,
      maxDiscountPercent,
      savings,
      message:
        savings > 0
          ? `Offer accepted. You save $${savings.toFixed(2)} off the listed cart total of $${summary.cartSubtotal.toFixed(2)}.`
          : `Offer accepted at the listed cart total of $${summary.cartSubtotal.toFixed(2)}.`,
    };
  }

  return {
    status: "rejected",
    accepted: false,
    ...summary,
    offeredTotal: offered,
    amountTowardEligible,
    minAcceptableEligible,
    minAcceptableCart,
    minCartSubtotal,
    maxDiscountPercent,
    message: `Offer of $${offered.toFixed(2)} is too low. Eligible items ($${summary.eligibleSubtotal.toFixed(2)}) can be discounted by at most ${maxDiscountPercent}% (minimum $${minAcceptableEligible.toFixed(2)}), and excluded items add $${summary.excludedSubtotal.toFixed(2)}. The lowest acceptable cart total is $${minAcceptableCart.toFixed(2)}.`,
  };
}

module.exports = {
  roundMoney,
  parseMoney,
  validateSettings,
  normalizeLineItems,
  summarizeCart,
  minimumAcceptableEligible,
  evaluateOffer,
};
