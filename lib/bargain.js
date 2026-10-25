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
    errors.push("Minimum cart value must be a valid number.");
  } else if (minCartSubtotal < 0) {
    errors.push("Minimum cart value cannot be negative.");
  }

  if (!Number.isFinite(maxDiscountPercent)) {
    errors.push("Maximum discount percentage must be a valid number.");
  } else if (maxDiscountPercent < 0) {
    errors.push("Maximum discount percentage cannot be negative.");
  } else if (maxDiscountPercent > 100) {
    errors.push("Maximum discount percentage cannot exceed 100.");
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    settings: {
      minCartSubtotal: roundMoney(minCartSubtotal),
      maxDiscountPercent: roundMoney(maxDiscountPercent),
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

function summarizeCart(lines) {
  let cartSubtotal = 0;
  let totalItems = 0;

  for (const line of lines) {
    cartSubtotal += line.lineTotal;
    totalItems += line.quantity;
  }

  cartSubtotal = roundMoney(cartSubtotal);

  return {
    lines,
    cartSubtotal,
    totalItems,
  };
}

function minimumAcceptableCart(cartSubtotal, maxDiscountPercent) {
  return roundMoney(cartSubtotal * (1 - maxDiscountPercent / 100));
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

  const { minCartSubtotal, maxDiscountPercent } = settingsResult.settings;
  const summary = summarizeCart(lines);
  const minAcceptableCartTotal = minimumAcceptableCart(
    summary.cartSubtotal,
    maxDiscountPercent
  );

  const offer = parseMoney(offeredTotal);
  if (!Number.isFinite(offer)) {
    return {
      status: "invalid",
      accepted: false,
      ...summary,
      minAcceptableCart: minAcceptableCartTotal,
      message: "Offer amount must be a valid number.",
    };
  }
  if (offer < 0) {
    return {
      status: "invalid",
      accepted: false,
      ...summary,
      offeredTotal: offer,
      minAcceptableCart: minAcceptableCartTotal,
      message: "Offer amount cannot be negative.",
    };
  }

  const offered = roundMoney(offer);

  // Check minimum cart value threshold set by seller (e.g. $500)
  if (summary.cartSubtotal < minCartSubtotal) {
    const needed = roundMoney(minCartSubtotal - summary.cartSubtotal);
    return {
      status: "unavailable",
      accepted: false,
      ...summary,
      offeredTotal: offered,
      minAcceptableCart: minAcceptableCartTotal,
      minCartSubtotal,
      maxDiscountPercent,
      neededToUnlock: needed,
      message: `The seller requires a minimum cart value of $${minCartSubtotal.toFixed(2)} to unlock bargaining. Your cart is currently $${summary.cartSubtotal.toFixed(2)} (add $${needed.toFixed(2)} more to make an offer).`,
    };
  }

  // Check if offered total meets the seller's floor price
  if (offered + 0.0001 >= minAcceptableCartTotal) {
    const savings = roundMoney(summary.cartSubtotal - offered);
    const discountPercent =
      summary.cartSubtotal > 0
        ? roundMoney((savings / summary.cartSubtotal) * 100)
        : 0;
    return {
      status: "accepted",
      accepted: true,
      ...summary,
      offeredTotal: offered,
      minAcceptableCart: minAcceptableCartTotal,
      minCartSubtotal,
      maxDiscountPercent,
      savings,
      discountPercent,
      message:
        savings > 0
          ? `Offer accepted! You save $${savings.toFixed(2)} (${discountPercent}%) off the standard total of $${summary.cartSubtotal.toFixed(2)}.`
          : `Offer accepted at full price ($${summary.cartSubtotal.toFixed(2)}).`,
    };
  }

  return {
    status: "rejected",
    accepted: false,
    ...summary,
    offeredTotal: offered,
    minAcceptableCart: minAcceptableCartTotal,
    minCartSubtotal,
    maxDiscountPercent,
    message: `Offer of $${offered.toFixed(2)} is below the seller's minimum acceptable total of $${minAcceptableCartTotal.toFixed(2)} (maximum ${maxDiscountPercent}% discount).`,
  };
}

module.exports = {
  roundMoney,
  parseMoney,
  validateSettings,
  normalizeLineItems,
  summarizeCart,
  minimumAcceptableCart,
  // Alias for backward compatibility if needed in any call
  minimumAcceptableEligible: minimumAcceptableCart,
  evaluateOffer,
};
