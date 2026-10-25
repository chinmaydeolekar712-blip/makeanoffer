"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { app, db } = require("../server");

let server;
let baseUrl;
let testApiKey;

before((_, done) => {
  server = http.createServer(app);
  server.listen(0, () => {
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Create an API key for testing
    const created = db.createApiKey("site_demo_wholesaler", "HTTP Test Key");
    testApiKey = created.secret_key;
    done();
  });
});

after((_, done) => {
  if (server) server.close(done);
  else done();
});

describe("Public Widget Configuration & CORS", () => {
  it("returns public configuration for a registered site", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/config?site_id=site_demo_wholesaler`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.site_id, "site_demo_wholesaler");
    assert.equal(data.min_cart_subtotal, 300);
    assert.equal(data.max_discount_percent, 15);
    assert.equal(data.secret_key, undefined); // Never leak secrets!
  });

  it("returns 404 for an unregistered site ID", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/config?site_id=site_unknown_xyz`);
    assert.equal(res.status, 404);
  });
});

describe("Server-to-Server API v1 Authentication", () => {
  it("rejects unauthorized requests missing Bearer key", async () => {
    const res = await fetch(`${baseUrl}/api/v1/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: "box", quantity: 1, unitPrice: 500 }], offeredTotal: 450 }),
    });
    assert.equal(res.status, 401);
  });

  it("processes and approves valid offers with active API key", async () => {
    const res = await fetch(`${baseUrl}/api/v1/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        items: [
          { id: "boxes-bundle", name: "Boxes", quantity: 2, unitPrice: 200 },
          { id: "tape-pack", name: "Tape", quantity: 2, unitPrice: 70 },
        ], // Subtotal: 540
        offeredTotal: 470,
        currency: "USD",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.status, "accepted");
    assert.equal(data.accepted, true);
    assert.equal(data.cart_subtotal, 540);
    assert.equal(data.offered_total, 470);
    assert.equal(data.discount_amount, 70);
    assert.ok(data.offer_id.startsWith("off_"));

    // Verify retrieval of offer record
    const getRes = await fetch(`${baseUrl}/api/v1/offers/${data.offer_id}`, {
      headers: { Authorization: `Bearer ${testApiKey}` },
    });
    assert.equal(getRes.status, 200);
    const retrieved = await getRes.json();
    assert.equal(retrieved.offer_id, data.offer_id);
    assert.equal(retrieved.redeemed, false);

    // Verify redemption
    const redeemRes = await fetch(`${baseUrl}/api/v1/offers/${data.offer_id}/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        items: [
          { id: "boxes-bundle", name: "Boxes", quantity: 2, unitPrice: 200 },
          { id: "tape-pack", name: "Tape", quantity: 2, unitPrice: 70 },
        ],
      }),
    });
    assert.equal(redeemRes.status, 200);
    const redeemedData = await redeemRes.json();
    assert.equal(redeemedData.ok, true);
    assert.equal(redeemedData.redeemed, true);

    // Second redemption must fail
    const secondRedeem = await fetch(`${baseUrl}/api/v1/offers/${data.offer_id}/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testApiKey}`,
      },
    });
    assert.equal(secondRedeem.status, 400);
  });
});

describe("Technical SEO, Robots, Sitemap & Error Pages", () => {
  it("serves valid robots.txt with sitemap reference", async () => {
    const res = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/plain/);
    const text = await res.text();
    assert.match(text, /User-agent:\s*\*/i);
    assert.match(text, /Sitemap:\s*http.*\/sitemap\.xml/i);
    assert.match(text, /Disallow:\s*\/merchant\.html/i);
  });

  it("serves valid sitemap.xml containing canonical public pages", async () => {
    const res = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /application\/xml/);
    const xml = await res.text();
    assert.match(xml, /<urlset/i);
    assert.match(xml, /\/for-wholesalers/i);
    assert.match(xml, /\/integrations/i);
    assert.doesNotMatch(xml, /merchant\.html/i); // No private pages in sitemap
  });

  it("returns real HTTP 404 for unknown browser pages", async () => {
    const res = await fetch(`${baseUrl}/non-existent-random-page-12345`, {
      headers: { Accept: "text/html" },
    });
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.match(html, /404/);
  });

  it("returns real HTTP 404 JSON for unknown API endpoints", async () => {
    const res = await fetch(`${baseUrl}/api/unknown-endpoint`, {
      headers: { Accept: "application/json" },
    });
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.match(json.error, /not found/i);
  });
});
