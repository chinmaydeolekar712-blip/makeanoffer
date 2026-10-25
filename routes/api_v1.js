"use strict";

const express = require("express");
const db = require("../lib/db");
const {
  validateSettings,
  normalizeLineItems,
  summarizeCart,
  minimumAcceptableCart,
  evaluateOffer,
  roundMoney,
} = require("../lib/bargain");

const router = express.Router();

/** CORS helper for permitted site origins */
function handleCors(req, res, site) {
  const origin = req.headers.origin;
  if (!origin) return;

  let permitted = [];
  try {
    permitted = JSON.parse(site.permitted_origins || "[]");
  } catch {
    permitted = [];
  }

  // If localhost, wildcard, or registered origin matches
  const isAllowed =
    permitted.includes("*") ||
    permitted.includes(origin) ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Vary", "Origin");
  }
}

/** Server-to-Server API Key Authentication Middleware */
function requireApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      ok: false,
      error: "Authentication required. Missing Authorization: Bearer <API_KEY> header.",
    });
  }

  const authenticated = db.authenticateApiKey(authHeader);
  if (!authenticated) {
    return res.status(401).json({
      ok: false,
      error: "Invalid, expired, or revoked API key.",
    });
  }

  req.auth = authenticated;
  next();
}

/** Admin Token or API Key authentication for management */
function requireAdminOrApiKey(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();

  // Check merchant admin token first
  const merchant = db.verifyMerchantAdmin(token);
  if (merchant) {
    req.adminMerchant = merchant;
    return next();
  }

  // Check server-to-server API key second
  const apiKeyAuth = db.authenticateApiKey(token);
  if (apiKeyAuth) {
    req.auth = apiKeyAuth;
    return next();
  }

  return res.status(401).json({
    ok: false,
    error: "Unauthorized. Valid Merchant Admin Secret or Active API Key required.",
  });
}

// --------------------------------------------------------------------------
// Public Widget Configuration Endpoint
// --------------------------------------------------------------------------
router.get("/public/config", (req, res) => {
  const siteId = String(req.query.site_id || "").trim();
  if (!siteId) {
    return res.status(400).json({ ok: false, error: "Missing required site_id query parameter." });
  }

  const site = db.getSiteById(siteId);
  if (!site) {
    return res.status(404).json({ ok: false, error: `No registered site found with ID '${siteId}'.` });
  }

  handleCors(req, res, site);

  // Return safe public config (no secrets, no emails, no raw credentials)
  res.json({
    ok: true,
    site_id: site.id,
    site_name: site.name,
    min_cart_subtotal: site.min_cart_subtotal,
    max_discount_percent: site.max_discount_percent,
    currency: site.currency || "USD",
  });
});

// --------------------------------------------------------------------------
// Server-to-Server Authoritative Offer Submission
// --------------------------------------------------------------------------
router.post("/offers", requireApiKey, (req, res) => {
  const site = req.auth;
  const body = req.body || {};

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: "Cart must contain at least one line item with a positive quantity.",
    });
  }

  // Normalize line items
  const normalized = normalizeLineItems(items);
  if (!normalized.ok) {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: normalized.error,
    });
  }

  // Evaluate offer against this merchant site's rules
  const settings = {
    minCartSubtotal: site.min_cart_subtotal,
    maxDiscountPercent: site.max_discount_percent,
  };

  const decision = evaluateOffer({
    settings,
    lines: normalized.lines,
    offeredTotal: body.offeredTotal,
  });

  if (decision.status === "invalid") {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: decision.message,
    });
  }

  // Persist offer record with 30-minute expiry
  const offerRecord = db.createOfferRecord({
    siteId: site.site_id,
    cartSubtotal: decision.cartSubtotal,
    offeredTotal: decision.offeredTotal,
    minAcceptableCart: decision.minAcceptableCart,
    discountAmount: decision.savings || 0,
    discountPercent: decision.discountPercent || 0,
    currency: site.currency || "USD",
    status: decision.status,
    message: decision.message,
    items: normalized.lines,
    expiresInMinutes: 30,
  });

  res.status(200).json({
    ok: true,
    offer_id: offerRecord.id,
    status: offerRecord.status,
    accepted: offerRecord.status === "accepted",
    cart_subtotal: offerRecord.cart_subtotal,
    offered_total: offerRecord.offered_total,
    min_acceptable_cart: offerRecord.min_acceptable_cart,
    discount_amount: offerRecord.discount_amount,
    discount_percent: offerRecord.discount_percent,
    currency: offerRecord.currency,
    cart_hash: offerRecord.cart_hash,
    expires_at: offerRecord.expires_at,
    redeemed: false,
    message: offerRecord.message,
  });
});

// --------------------------------------------------------------------------
// Offer Verification & Redemption (Single-Use Checkout Enforcement)
// --------------------------------------------------------------------------
router.get("/offers/:id", requireApiKey, (req, res) => {
  const offer = db.getOffer(req.params.id, req.auth.site_id);
  if (!offer) {
    return res.status(404).json({ ok: false, error: "Offer not found." });
  }

  const isExpired = new Date(offer.expires_at) < new Date();
  res.json({
    ok: true,
    offer_id: offer.id,
    status: offer.status,
    accepted: offer.status === "accepted",
    cart_subtotal: offer.cart_subtotal,
    offered_total: offer.offered_total,
    discount_amount: offer.discount_amount,
    currency: offer.currency,
    cart_hash: offer.cart_hash,
    expires_at: offer.expires_at,
    is_expired: isExpired,
    redeemed: offer.redeemed,
    redeemed_at: offer.redeemed_at,
    created_at: offer.created_at,
  });
});

router.post("/offers/:id/redeem", requireApiKey, (req, res) => {
  const items = req.body && Array.isArray(req.body.items) ? req.body.items : null;
  const currentLines = items ? normalizeLineItems(items).lines : null;

  const result = db.redeemOffer(req.params.id, req.auth.site_id, currentLines);
  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json({
    ok: true,
    redeemed: true,
    offer_id: result.offer_id,
    redeemed_at: result.redeemed_at,
    discount_amount: result.discount_amount,
    authorized_final_total: result.authorized_final_total,
    message: "Offer successfully redeemed and closed against order.",
  });
});

// --------------------------------------------------------------------------
// Merchant Site Settings & Governance
// --------------------------------------------------------------------------
router.get("/sites/settings", requireAdminOrApiKey, (req, res) => {
  const siteId = (req.auth && req.auth.site_id) || req.query.site_id || "site_demo_wholesaler";
  const site = db.getSiteById(siteId);
  if (!site) {
    return res.status(404).json({ ok: false, error: "Site not found." });
  }

  let permittedOrigins = [];
  try {
    permittedOrigins = JSON.parse(site.permitted_origins || "[]");
  } catch {
    permittedOrigins = [];
  }

  res.json({
    ok: true,
    site: {
      id: site.id,
      name: site.name,
      min_cart_subtotal: site.min_cart_subtotal,
      max_discount_percent: site.max_discount_percent,
      currency: site.currency,
      permitted_origins: permittedOrigins,
    },
  });
});

router.put("/sites/settings", requireAdminOrApiKey, (req, res) => {
  const siteId = (req.auth && req.auth.site_id) || req.body.site_id || "site_demo_wholesaler";
  const body = req.body || {};

  const validation = validateSettings({
    minCartSubtotal: body.minCartSubtotal != null ? body.minCartSubtotal : body.min_cart_subtotal,
    maxDiscountPercent: body.maxDiscountPercent != null ? body.maxDiscountPercent : body.max_discount_percent,
  });

  if (!validation.ok) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  let permittedOrigins = body.permittedOrigins || body.permitted_origins;
  if (typeof permittedOrigins === "string") {
    try {
      permittedOrigins = JSON.parse(permittedOrigins);
    } catch {
      permittedOrigins = permittedOrigins.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  const updated = db.updateSiteSettings(siteId, {
    minCartSubtotal: validation.settings.minCartSubtotal,
    maxDiscountPercent: validation.settings.maxDiscountPercent,
    permittedOrigins: permittedOrigins || undefined,
  });

  if (!updated) {
    return res.status(404).json({ ok: false, error: "Site not found." });
  }

  res.json({
    ok: true,
    site: {
      id: updated.id,
      name: updated.name,
      min_cart_subtotal: updated.min_cart_subtotal,
      max_discount_percent: updated.max_discount_percent,
      currency: updated.currency,
      permitted_origins: JSON.parse(updated.permitted_origins || "[]"),
    },
    message: "Settings updated successfully.",
  });
});

// --------------------------------------------------------------------------
// API Key Lifecycle (Create, List, Revoke)
// --------------------------------------------------------------------------
router.get("/keys", requireAdminOrApiKey, (req, res) => {
  const siteId = (req.auth && req.auth.site_id) || req.query.site_id || "site_demo_wholesaler";
  const keys = db.listApiKeys(siteId);
  res.json({ ok: true, keys });
});

router.post("/keys", requireAdminOrApiKey, (req, res) => {
  const siteId = (req.auth && req.auth.site_id) || req.body.site_id || "site_demo_wholesaler";
  const name = String(req.body && req.body.name || "Backend Server Key").trim();

  const created = db.createApiKey(siteId, name);
  res.status(201).json({
    ok: true,
    key: created,
    warning: "Save this secret key now. It is cryptographically hashed and cannot be retrieved again.",
  });
});

router.post("/keys/:id/revoke", requireAdminOrApiKey, (req, res) => {
  const siteId = (req.auth && req.auth.site_id) || req.body.site_id || "site_demo_wholesaler";
  const keyId = req.params.id;

  const revoked = db.revokeApiKey(keyId, siteId);
  if (!revoked) {
    return res.status(404).json({ ok: false, error: "Active key not found or already revoked." });
  }

  res.json({ ok: true, message: `Key ${keyId} successfully revoked.` });
});

// --------------------------------------------------------------------------
// Offer Audit Log (Recent Offers)
// --------------------------------------------------------------------------
router.get("/offers", requireAdminOrApiKey, (req, res) => {
  const siteId = (req.auth && req.auth.site_id) || req.query.site_id || "site_demo_wholesaler";
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offers = db.listRecentOffers(siteId, limit);
  res.json({ ok: true, offers });
});

module.exports = router;
