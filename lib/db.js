"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "bargainos.db");
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode, busy timeout, and foreign keys for SQLite performance and integrity
db.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    admin_token_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    permitted_origins TEXT NOT NULL DEFAULT '["http://localhost:3000"]',
    min_cart_subtotal REAL NOT NULL DEFAULT 500.0,
    max_discount_percent REAL NOT NULL DEFAULT 15.0,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TEXT NOT NULL,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    cart_subtotal REAL NOT NULL,
    offered_total REAL NOT NULL,
    min_acceptable_cart REAL NOT NULL,
    discount_amount REAL NOT NULL,
    discount_percent REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    items_json TEXT NOT NULL,
    cart_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    redeemed INTEGER NOT NULL DEFAULT 0,
    redeemed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sites_merchant ON sites(merchant_id);
  CREATE INDEX IF NOT EXISTS idx_keys_site ON api_keys(site_id);
  CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash);
  CREATE INDEX IF NOT EXISTS idx_offers_site ON offers(site_id);
  CREATE INDEX IF NOT EXISTS idx_offers_expires ON offers(expires_at);
`);

/** Cryptographic helpers */
function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret).trim()).digest("hex");
}

function generateSecureToken(prefix = "sk_live") {
  const random = crypto.randomBytes(24).toString("hex");
  return `${prefix}_${random}`;
}

function generateId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function computeCartHash(lines) {
  // Hash sorted, normalized line items to prevent checkout cart tampering
  const normalized = lines
    .map((l) => `${l.id}:${l.quantity}:${Number(l.unitPrice).toFixed(2)}`)
    .sort()
    .join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Seed demo merchant and site if table is empty */
function seedDemoData() {
  const count = db.prepare("SELECT COUNT(*) AS c FROM merchants").get().c;
  if (count === 0) {
    const now = new Date().toISOString();
    const demoAdminToken = process.env.DEMO_ADMIN_KEY || "demo_admin_secret_key_2026";
    const demoMerchantId = "m_demo_wholesaler";
    const demoSiteId = "site_demo_wholesaler";

    db.prepare(`
      INSERT INTO merchants (id, name, email, admin_token_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      demoMerchantId,
      "Apex Packaging Wholesale",
      "admin@apexpackaging.example.com",
      hashSecret(demoAdminToken),
      now
    );

    // Default origins include localhost:3000 and 127.0.0.1
    const defaultOrigins = JSON.stringify([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://apexpackaging.example.com"
    ]);

    db.prepare(`
      INSERT INTO sites (id, merchant_id, name, permitted_origins, min_cart_subtotal, max_discount_percent, currency, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      demoSiteId,
      demoMerchantId,
      "Apex Packaging B2B Store",
      defaultOrigins,
      500.0,
      15.0,
      "USD",
      now
    );

    // Create an initial API key
    const initialApiKey = "sk_live_demo_apex_wholesale_key_2026";
    const keyHash = hashSecret(initialApiKey);
    const keyPrefix = initialApiKey.slice(0, 15) + "...";

    db.prepare(`
      INSERT INTO api_keys (id, site_id, name, key_prefix, key_hash, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(
      generateId("key"),
      demoSiteId,
      "Primary Wholesaler Server Key",
      keyPrefix,
      keyHash,
      now
    );
  }
}

seedDemoData();

// Export database accessors
module.exports = {
  db,
  hashSecret,
  generateSecureToken,
  generateId,
  computeCartHash,

  // Merchant operations
  getMerchantByEmail(email) {
    return db.prepare("SELECT * FROM merchants WHERE email = ?").get(email);
  },

  getMerchantById(id) {
    return db.prepare("SELECT * FROM merchants WHERE id = ?").get(id);
  },

  verifyMerchantAdmin(adminToken) {
    if (!adminToken) return null;
    const hashed = hashSecret(adminToken);
    return db.prepare("SELECT * FROM merchants WHERE admin_token_hash = ?").get(hashed);
  },

  createMerchant({ name, email, adminToken }) {
    const id = generateId("m");
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO merchants (id, name, email, admin_token_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, email, hashSecret(adminToken), now);
    return { id, name, email, created_at: now };
  },

  // Site operations
  getSiteById(siteId) {
    return db.prepare("SELECT * FROM sites WHERE id = ?").get(siteId);
  },

  getSitesByMerchant(merchantId) {
    return db.prepare("SELECT * FROM sites WHERE merchant_id = ?").all(merchantId);
  },

  createSite({ merchantId, name, permittedOrigins = ["http://localhost:3000"], minCartSubtotal = 500, maxDiscountPercent = 15, currency = "USD" }) {
    const id = generateId("site");
    const now = new Date().toISOString();
    const originsJson = typeof permittedOrigins === "string" ? permittedOrigins : JSON.stringify(permittedOrigins);
    db.prepare(`
      INSERT INTO sites (id, merchant_id, name, permitted_origins, min_cart_subtotal, max_discount_percent, currency, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, merchantId, name, originsJson, Number(minCartSubtotal), Number(maxDiscountPercent), currency, now);
    return { id, merchant_id: merchantId, name, permitted_origins: originsJson, min_cart_subtotal: Number(minCartSubtotal), max_discount_percent: Number(maxDiscountPercent), currency, created_at: now };
  },

  updateSiteSettings(siteId, { minCartSubtotal, maxDiscountPercent, permittedOrigins }) {
    const existing = db.prepare("SELECT * FROM sites WHERE id = ?").get(siteId);
    if (!existing) return null;

    const newMin = minCartSubtotal != null ? Number(minCartSubtotal) : existing.min_cart_subtotal;
    const newMax = maxDiscountPercent != null ? Number(maxDiscountPercent) : existing.max_discount_percent;
    const newOrigins = permittedOrigins != null
      ? (typeof permittedOrigins === "string" ? permittedOrigins : JSON.stringify(permittedOrigins))
      : existing.permitted_origins;

    db.prepare(`
      UPDATE sites
      SET min_cart_subtotal = ?, max_discount_percent = ?, permitted_origins = ?
      WHERE id = ?
    `).run(newMin, newMax, newOrigins, siteId);

    return db.prepare("SELECT * FROM sites WHERE id = ?").get(siteId);
  },

  // API Key operations
  createApiKey(siteId, name = "Server Backend Key") {
    const plainSecret = generateSecureToken("sk_live");
    const keyHash = hashSecret(plainSecret);
    const keyPrefix = plainSecret.slice(0, 16) + "...";
    const id = generateId("key");
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO api_keys (id, site_id, name, key_prefix, key_hash, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(id, siteId, name, keyPrefix, keyHash, now);

    return {
      id,
      site_id: siteId,
      name,
      key_prefix: keyPrefix,
      secret_key: plainSecret, // ONLY REVEALED ONCE
      status: "active",
      created_at: now
    };
  },

  listApiKeys(siteId) {
    return db.prepare(`
      SELECT id, site_id, name, key_prefix, status, created_at, revoked_at
      FROM api_keys
      WHERE site_id = ?
      ORDER BY created_at DESC
    `).all(siteId);
  },

  revokeApiKey(keyId, siteId) {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE api_keys
      SET status = 'revoked', revoked_at = ?
      WHERE id = ? AND site_id = ? AND status = 'active'
    `).run(now, keyId, siteId);
    return result.changes > 0;
  },

  authenticateApiKey(bearerToken) {
    if (!bearerToken || typeof bearerToken !== "string") return null;
    const rawKey = bearerToken.startsWith("Bearer ") ? bearerToken.slice(7).trim() : bearerToken.trim();
    if (!rawKey) return null;

    const keyHash = hashSecret(rawKey);
    const row = db.prepare(`
      SELECT k.id AS key_id, k.site_id, k.status AS key_status, s.merchant_id, s.name AS site_name, s.min_cart_subtotal, s.max_discount_percent, s.currency, s.permitted_origins
      FROM api_keys k
      JOIN sites s ON k.site_id = s.id
      WHERE k.key_hash = ? AND k.status = 'active'
    `).get(keyHash);

    return row || null;
  },

  // Offer operations
  createOfferRecord({
    siteId,
    cartSubtotal,
    offeredTotal,
    minAcceptableCart,
    discountAmount,
    discountPercent,
    currency = "USD",
    status,
    message,
    items,
    expiresInMinutes = 30
  }) {
    const id = generateId("off");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();
    const itemsJson = JSON.stringify(items);
    const cartHash = computeCartHash(items);

    db.prepare(`
      INSERT INTO offers (
        id, site_id, cart_subtotal, offered_total, min_acceptable_cart,
        discount_amount, discount_percent, currency, status, message,
        items_json, cart_hash, expires_at, redeemed, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      siteId,
      cartSubtotal,
      offeredTotal,
      minAcceptableCart,
      discountAmount,
      discountPercent,
      currency,
      status,
      message,
      itemsJson,
      cartHash,
      expiresAt,
      now.toISOString()
    );

    return {
      id,
      site_id: siteId,
      cart_subtotal: cartSubtotal,
      offered_total: offeredTotal,
      min_acceptable_cart: minAcceptableCart,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      currency,
      status,
      message,
      cart_hash: cartHash,
      expires_at: expiresAt,
      redeemed: false,
      created_at: now.toISOString()
    };
  },

  getOffer(offerId, siteId = null) {
    let query = "SELECT * FROM offers WHERE id = ?";
    const params = [offerId];
    if (siteId) {
      query += " AND site_id = ?";
      params.push(siteId);
    }
    const row = db.prepare(query).get(...params);
    if (!row) return null;
    return {
      ...row,
      redeemed: Boolean(row.redeemed),
      items: JSON.parse(row.items_json || "[]")
    };
  },

  redeemOffer(offerId, siteId, currentCartLines) {
    const offer = this.getOffer(offerId, siteId);
    if (!offer) {
      return { ok: false, error: "Offer record not found for this site." };
    }

    if (offer.status !== "accepted") {
      return { ok: false, error: "Only accepted offers can be redeemed." };
    }

    if (offer.redeemed) {
      return { ok: false, error: "Offer has already been redeemed and cannot be reused." };
    }

    const now = new Date();
    if (new Date(offer.expires_at) < now) {
      return { ok: false, error: "Offer has expired." };
    }

    // Verify cart integrity: the cart at checkout must match the cart that was bargained
    if (currentCartLines) {
      const currentCartHash = computeCartHash(currentCartLines);
      if (currentCartHash !== offer.cart_hash) {
        return {
          ok: false,
          error: "Cart line items or quantities have changed since offer was approved. Offer is invalidated."
        };
      }
    }

    const redeemedAt = now.toISOString();
    db.prepare(`
      UPDATE offers
      SET redeemed = 1, redeemed_at = ?
      WHERE id = ? AND site_id = ? AND redeemed = 0
    `).run(redeemedAt, offerId, siteId);

    return {
      ok: true,
      redeemed: true,
      offer_id: offerId,
      redeemed_at: redeemedAt,
      discount_amount: offer.discount_amount,
      authorized_final_total: offer.offered_total
    };
  },

  listRecentOffers(siteId, limit = 25) {
    const rows = db.prepare(`
      SELECT id, cart_subtotal, offered_total, min_acceptable_cart, discount_amount, discount_percent, currency, status, message, expires_at, redeemed, redeemed_at, created_at
      FROM offers
      WHERE site_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(siteId, limit);

    return rows.map((r) => ({
      ...r,
      redeemed: Boolean(r.redeemed)
    }));
  }
};
