"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const db = require("./lib/db");
const apiV1Router = require("./routes/api_v1");
const { getCatalog, getProductById } = require("./data/catalog");
const {
  validateSettings,
  normalizeLineItems,
  summarizeCart,
  minimumAcceptableCart,
  evaluateOffer,
  roundMoney,
} = require("./lib/bargain");

const app = express();
app.use(express.json());

// Public static files (CSS, client JS, widget.js, images)
app.use(express.static(path.join(__dirname, "public")));

// Environment-based site URL for SEO (default to localhost for development)
const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

// --------------------------------------------------------------------------
// Clean Public Route Aliases
// --------------------------------------------------------------------------
app.get("/for-wholesalers", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "for-wholesalers.html"));
});

app.get("/integrations", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "integrations.html"));
});

// --------------------------------------------------------------------------
// Technical SEO: robots.txt and sitemap.xml
// --------------------------------------------------------------------------
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain");
  res.send(
`User-agent: *
Allow: /
Allow: /for-wholesalers
Allow: /integrations
Allow: /widget-demo.html
Allow: /widget.js
Disallow: /merchant.html
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`
  );
});

app.get("/sitemap.xml", (_req, res) => {
  res.type("application/xml");
  const lastmod = new Date().toISOString().split("T")[0];
  const sitemapXml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/for-wholesalers</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${SITE_URL}/integrations</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${SITE_URL}/widget-demo.html</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;
  res.send(sitemapXml);
});

// --------------------------------------------------------------------------
// Mount Versioned API v1 Router
// --------------------------------------------------------------------------
app.use("/api/v1", apiV1Router);

// --------------------------------------------------------------------------
// Legacy / Prototype Routes (backed by persistent SQLite data)
// --------------------------------------------------------------------------
app.get("/api/catalog", (_req, res) => {
  res.json({ products: getCatalog() });
});

function getActiveSiteSettings() {
  const site = db.getSiteById("site_demo_wholesaler");
  if (site) {
    return {
      minCartSubtotal: site.min_cart_subtotal,
      maxDiscountPercent: site.max_discount_percent,
    };
  }
  return { minCartSubtotal: 300, maxDiscountPercent: 15 };
}

function cartPreview(settings) {
  const catalog = getCatalog();
  const defaultLines = catalog.map((product) => ({
    id: product.id,
    quantity: product.defaultQty,
  }));
  const normalized = normalizeLineItems(defaultLines, getProductById);
  const summary = summarizeCart(normalized.lines);
  const minAcceptableCartTotal = minimumAcceptableCart(
    summary.cartSubtotal,
    settings.maxDiscountPercent
  );
  const bargainingAvailable = summary.cartSubtotal >= settings.minCartSubtotal;
  const neededToUnlock = roundMoney(
    Math.max(0, settings.minCartSubtotal - summary.cartSubtotal)
  );

  return {
    ...summary,
    minCartSubtotal: settings.minCartSubtotal,
    maxDiscountPercent: settings.maxDiscountPercent,
    bargainingAvailable,
    minAcceptableCart: minAcceptableCartTotal,
    neededToUnlock,
  };
}

app.get("/api/settings", (_req, res) => {
  const settings = getActiveSiteSettings();
  res.json({ settings, preview: cartPreview(settings) });
});

app.put("/api/settings", (req, res) => {
  const result = validateSettings(req.body || {});
  if (!result.ok) {
    return res.status(400).json({ ok: false, errors: result.errors });
  }

  db.updateSiteSettings("site_demo_wholesaler", {
    minCartSubtotal: result.settings.minCartSubtotal,
    maxDiscountPercent: result.settings.maxDiscountPercent,
  });

  const updatedSettings = getActiveSiteSettings();
  res.json({ ok: true, settings: updatedSettings, preview: cartPreview(updatedSettings) });
});

app.post("/api/offers", (req, res) => {
  const settings = getActiveSiteSettings();
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

  // Record offer in database
  db.createOfferRecord({
    siteId: "site_demo_wholesaler",
    cartSubtotal: decision.cartSubtotal,
    offeredTotal: decision.offeredTotal,
    minAcceptableCart: decision.minAcceptableCart,
    discountAmount: decision.savings || 0,
    discountPercent: decision.discountPercent || 0,
    status: decision.status,
    message: decision.message,
    items: normalized.lines,
    expiresInMinutes: 30,
  });

  const statusCode = decision.status === "invalid" ? 400 : 200;
  res.status(statusCode).json({ ok: decision.status !== "invalid", ...decision });
});

// --------------------------------------------------------------------------
// 404 Not Found Handler
// --------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404);
  if (req.path.startsWith("/api/") || req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"))) {
    return res.json({ ok: false, error: "Resource or endpoint not found." });
  }
  res.sendFile(path.join(__dirname, "public", "404.html"));
});

// --------------------------------------------------------------------------
// Centralized 500 Error Handler
// --------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  // Keep error stack strictly server-side
  console.error("[BargainOS Server Error]", err.message);

  res.status(500);
  if (req.path.startsWith("/api/") || req.xhr || (req.headers.accept && req.headers.accept.includes("application/json"))) {
    return res.json({ ok: false, error: "Internal Server Error" });
  }
  res.sendFile(path.join(__dirname, "public", "500.html"));
});

const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BargainOS running at http://localhost:${PORT}`);
    console.log(`Merchant dashboard: http://localhost:${PORT}/merchant.html`);
  });
}

module.exports = { app, db };
