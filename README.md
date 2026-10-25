# BargainOS &mdash; Automated Cart Bargaining for Online Wholesalers

BargainOS is a specialized B2B ecommerce pricing engine that automates bulk cart-level discount negotiation for independent online wholesalers (packaging supplies, shipping materials, and standardized bulk goods).

It allows qualified commercial buyers to propose a custom price for their shopping cart while strictly and deterministically enforcing seller-defined minimum order thresholds and maximum discount floors.

---

## Table of Contents

1. [Value Proposition & Core Benefits](#value-proposition--core-benefits)
2. [Pricing](#pricing)
3. [Architecture Overview](#architecture-overview)
4. [Local Setup & Running](#local-setup--running)
5. [Environment Variables](#environment-variables)
6. [Database Schema (SQLite Persistence)](#database-schema-sqlite-persistence)
7. [Custom Website Integration](#custom-website-integration)
   - [Frontend Embeddable Widget (`widget.js`)](#frontend-embeddable-widget-widgetjs)
   - [Server-to-Server Authenticated REST API (`/api/v1/`)](#server-to-server-authenticated-rest-api-apiv1)
   - [Checkout Price Enforcement & Single-Use Redemption](#checkout-price-enforcement--single-use-redemption)
   - [Reference Adapter (`examples/reference-adapter.js`)](#reference-adapter-examplesreference-adapterjs)
8. [Platform Integration Status](#platform-integration-status)
9. [Technical SEO & Error Handling](#technical-seo--error-handling)
10. [Automated Testing](#automated-testing)
11. [Known Limitations](#known-limitations)

---

## Value Proposition & Core Benefits

- **Reduce Manual Quote Labor**: Eliminates time-consuming back-and-forth discount emails and phone calls for standard bulk order requests.
- **Instant Buyer Qualification**: Qualified purchasers can negotiate and finalize orders immediately without waiting hours for sales staff approvals.
- **Strict Margin Protection**: Every approved offer strictly respects pre-programmed seller discount floors (e.g., maximum 15% discount).
- **Drive Larger Order Values**: The qualifying minimum cart threshold (e.g., $500.00) incentivizes buyers to add items to their cart to unlock bargaining.
- **Custom Website Integration**: Connects to bespoke ecommerce stores via an embeddable widget and server-to-server REST API.

---

## Pricing

### BargainOS &mdash; $49 / month
*Single transparent plan designed for independent wholesalers.*

- Deterministic cart bargaining engine (`lib/bargain.js`)
- Seller-defined minimum qualifying cart threshold
- Configurable maximum discount percentage floor protection
- Embeddable frontend JavaScript widget (`/widget.js`)
- Server-to-server authenticated REST API (`/api/v1/`)
- Cryptographically hashed API key credentials (SHA-256)
- Offer expiry windows (30-minute tokens) & single-use checkout redemption
- Persistent SQLite data storage with multi-tenant isolation
- CORS origin restriction for registered merchant domains

*Note: In this MVP release, subscription billing is configured as an informational plan; live credit card payment processing is not simulated.*

---

## Architecture Overview

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, and CSS3 styled with the minimalist Swiss/Bugatti luxury design tokens (pure black `#000000` canvas, tracked display headings, serif editorial copy, and monospace labels).
- **Backend**: Node.js with Express 4.
- **Database**: SQLite (via Node's native `DatabaseSync` in `node:sqlite`), supporting WAL mode and foreign key constraints.
- **Core Engine**: Pure mathematical functions in `lib/bargain.js`.

---

## Local Setup & Running

### Prerequisites
- Node.js 18 or newer (Node.js 22+ recommended for built-in `node:sqlite`).

### Installation & Startup
```bash
# Clone the repository and install dependencies
npm install

# Start the server
npm start
```

### URLs
- **Homepage & Cart Demo**: [http://localhost:3000](http://localhost:3000)
- **Wholesaler Educational Guide**: [http://localhost:3000/for-wholesalers](http://localhost:3000/for-wholesalers)
- **Developer Integration Guide**: [http://localhost:3000/integrations](http://localhost:3000/integrations)
- **Widget Live Demonstration**: [http://localhost:3000/widget-demo.html](http://localhost:3000/widget-demo.html)
- **Merchant Control Portal**: [http://localhost:3000/merchant.html](http://localhost:3000/merchant.html)

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the Express server to listen on. |
| `SITE_URL` | `http://localhost:3000` | Canonical production domain used for `sitemap.xml` and `robots.txt`. |
| `DATABASE_PATH` | `./data/bargainos.db` | Absolute or relative path to the SQLite database file. |
| `DEMO_ADMIN_KEY`| `demo_admin_secret_key_2026` | Admin secret key used to access the merchant management portal. |

---

## Database Schema (SQLite Persistence)

Data is persisted in `data/bargainos.db` across four normalized tables:

1. **`merchants`**: Stores merchant accounts (`id`, `name`, `email`, `admin_token_hash`, `created_at`).
2. **`sites`**: Multi-tenant site configurations (`id`, `merchant_id`, `name`, `permitted_origins`, `min_cart_subtotal`, `max_discount_percent`, `currency`, `created_at`).
3. **`api_keys`**: Cryptographically hashed server API keys (`id`, `site_id`, `name`, `key_prefix`, `key_hash`, `status`, `created_at`, `revoked_at`). Secret keys are hashed with SHA-256 and never stored in plaintext.
4. **`offers`**: Audit trail of generated customer offers (`id`, `site_id`, `cart_subtotal`, `offered_total`, `min_acceptable_cart`, `discount_amount`, `discount_percent`, `status`, `items_json`, `cart_hash`, `expires_at`, `redeemed`, `redeemed_at`, `created_at`).

---

## Custom Website Integration

### Frontend Embeddable Widget (`widget.js`)

Merchants embed the widget script into their custom cart or checkout template:

```html
<!-- Load the widget with your store's public site ID -->
<script src="https://YOUR-BARGAINOS-DOMAIN/widget.js" data-site-id="site_demo_wholesaler" defer></script>

<!-- In-page mount point for the threshold progress bar and offer trigger -->
<div id="bargainos-widget-container" data-cart-total="545.00"></div>
```

The `data-site-id` is public. When the customer updates quantities in their cart, the merchant frontend calls:
```javascript
window.BargainOS.updateCartTotal(newSubtotal);
```

### Server-to-Server Authenticated REST API (`/api/v1/`)

#### 1. Public Configuration
`GET /api/v1/public/config?site_id=site_demo_wholesaler`  
Returns public, non-sensitive threshold settings with CORS validation against registered origins.

#### 2. Submit Authoritative Offer
`POST /api/v1/offers`  
**Headers**: `Authorization: Bearer sk_live_...`  
**Body**:
```json
{
  "items": [
    { "id": "BOX-25", "name": "Corrugated Cartons (25pk)", "quantity": 2, "unitPrice": 180.00 },
    { "id": "FILM-4", "name": "Stretch Wrap Film (4pk)", "quantity": 1, "unitPrice": 120.00 }
  ],
  "offeredTotal": 420.00,
  "currency": "USD"
}
```

#### 3. Inspect Offer Status
`GET /api/v1/offers/:id`  
**Headers**: `Authorization: Bearer sk_live_...`  
Returns the offer status, expiration timestamp, and redemption state.

#### 4. Redeem Offer (Enforce at Checkout)
`POST /api/v1/offers/:id/redeem`  
**Headers**: `Authorization: Bearer sk_live_...`  
Atomically redeems the offer upon order placement. Optionally pass `{ items: [...] }` to verify that the cart line items were not modified after the discount was negotiated.

### Reference Adapter (`examples/reference-adapter.js`)

A complete runnable Express adapter is included in [examples/reference-adapter.js](file:///f:/MAKE%20YOUR%20OFFER/examples/reference-adapter.js) showing how custom ecommerce stores:
1. Look up server-side cart line items.
2. Call BargainOS with their private API key.
3. Validate and redeem the offer when placing the order with the payment processor.

---

## Platform Integration Status

| Platform | Status | Implementation Details |
| :--- | :--- | :--- |
| **Custom-Coded Stores** | **Available Now** | Supported via `/widget.js` embed and `/api/v1/` server REST API. Works with Node.js, PHP, Python, Ruby, and headless frameworks. |
| **Shopify** | **Planned / In Development** | Requires a dedicated Shopify App utilizing Shopify Functions / Cart Transform API for discount draft order automation. |
| **WooCommerce** | **Planned / In Development** | Requires a dedicated WordPress plugin to hook into WooCommerce session carts. |

---

## Technical SEO & Error Handling

- **Robots.txt** (`/robots.txt`): Explicitly references the sitemap and disallows indexing of private merchant portals and API endpoints.
- **Sitemap** (`/sitemap.xml`): Dynamically generated using `SITE_URL` containing only canonical, public pages.
- **Structured Data**: Includes Schema.org `SoftwareApplication` and `FAQPage` JSON-LD metadata on the homepage.
- **Branded Error Pages**:
  - Unrecognized routes return real HTTP `404` (JSON for `/api/` calls, [public/404.html](file:///f:/MAKE%20YOUR%20OFFER/public/404.html) for browser requests).
  - Internal exceptions return real HTTP `500` (JSON for `/api/` calls, [public/500.html](file:///f:/MAKE%20YOUR%20OFFER/public/500.html) for browser requests), keeping stack traces strictly server-side.

---

## Automated Testing

Run the automated test suite covering bargaining logic, multi-tenant database isolation, API key lifecycle, offer expiry, single-use redemption, SEO, and HTTP error handling:

```bash
npm test
```

Test files:
- [test/bargain.test.js](file:///f:/MAKE%20YOUR%20OFFER/test/bargain.test.js): Mathematical floor, discount calculations, input normalization.
- [test/integration.test.js](file:///f:/MAKE%20YOUR%20OFFER/test/integration.test.js): SQLite multi-tenancy, API key hashing, cart integrity verification, single-use redemption.
- [test/http.test.js](file:///f:/MAKE%20YOUR%20OFFER/test/http.test.js): HTTP endpoints, Bearer authentication, public widget config, robots.txt, sitemap.xml, 404/500 status codes.

---

## Known Limitations

- **Checkout Enforcement Requires Merchant Backend**: A generic JavaScript widget cannot unilaterally modify third-party payment gateways. The merchant's backend must verify and redeem the offer as documented.
- **No Hosted Platform Apps Yet**: Native one-click apps for Shopify and WooCommerce are on the technical roadmap and not yet built.
- **Local SQLite Storage**: Suitable for single-instance or container deployments with persistent storage; horizontally scaled multi-region clusters will require external database support (e.g. PostgreSQL).
