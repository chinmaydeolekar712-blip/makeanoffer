"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const { getCatalog, getProductById } = require("./data/catalog");
const {
  validateSettings,
  normalizeLineItems,
  summarizeCart,
  minimumAcceptableEligible,
  evaluateOffer,
  roundMoney,
} = require("./lib/bargain");

const SETTINGS_PATH = path.join(__dirname, "data", "settings.json");
const DEFAULT_SETTINGS = {
  minCartSubtotal: 250,
  maxDiscountPercent: 15,
  excludedProductIds: ["gift-card", "sale-vase"],
};

function readSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    const result = validateSettings(raw);
    if (result.ok) return result.settings;
  } catch {
    // Fall through to defaults if the file is missing or corrupt.
  }
  return { ...DEFAULT_SETTINGS, excludedProductIds: [...DEFAULT_SETTINGS.excludedProductIds] };
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

function cartPreview(settings) {
  const catalog = getCatalog();
  const defaultLines = catalog.map((product) => ({
    id: product.id,
    quantity: product.defaultQty,
  }));
  const normalized = normalizeLineItems(defaultLines, getProductById);
  const summary = summarizeCart(normalized.lines, settings.excludedProductIds);
  const minAcceptableEligible = minimumAcceptableEligible(
    summary.eligibleSubtotal,
    settings.maxDiscountPercent
  );
  return {
    ...summary,
    minCartSubtotal: settings.minCartSubtotal,
    maxDiscountPercent: settings.maxDiscountPercent,
    bargainingAvailable: summary.eligibleSubtotal >= settings.minCartSubtotal,
    minAcceptableEligible,
    minAcceptableCart: roundMoney(minAcceptableEligible + summary.excludedSubtotal),
  };
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/catalog", (_req, res) => {
  res.json({ products: getCatalog() });
});

app.get("/api/settings", (_req, res) => {
  const settings = readSettings();
  res.json({ settings, preview: cartPreview(settings) });
});

app.put("/api/settings", (req, res) => {
  const result = validateSettings(req.body || {});
  if (!result.ok) {
    return res.status(400).json({ ok: false, errors: result.errors });
  }

  const knownIds = new Set(getCatalog().map((p) => p.id));
  const excludedProductIds = result.settings.excludedProductIds.filter((id) =>
    knownIds.has(id)
  );
  const settings = { ...result.settings, excludedProductIds };
  writeSettings(settings);
  res.json({ ok: true, settings, preview: cartPreview(settings) });
});

app.post("/api/offers", (req, res) => {
  const settings = readSettings();
  const body = req.body || {};
  const normalized = normalizeLineItems(body.items, getProductById);
  if (!normalized.ok) {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      accepted: false,
      message: normalized.error,
    });
  }

  const decision = evaluateOffer({
    settings,
    lines: normalized.lines,
    offeredTotal: body.offeredTotal,
  });

  const statusCode = decision.status === "invalid" ? 400 : 200;
  res.status(statusCode).json({ ok: decision.status !== "invalid", ...decision });
});

const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BargainOS running at http://localhost:${PORT}`);
    console.log(`Merchant dashboard: http://localhost:${PORT}/merchant.html`);
  });
}

module.exports = { app, readSettings, writeSettings };
