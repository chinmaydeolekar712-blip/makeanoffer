# BargainOS (MVP v1)

Standalone prototype for a SaaS that lets shoppers negotiate a cart total against merchant rules. This version has no Shopify, payments, auth, or AI.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

- Customer cart: http://localhost:3000
- Merchant dashboard: http://localhost:3000/merchant.html

Run the bargaining-rule checks:

```bash
npm test
```

## How to test the bargaining flow

1. Open the merchant dashboard. Defaults are a **$250** eligible-cart minimum and a **15%** maximum discount. Gift card and clearance vase are excluded.
2. Open the customer cart. Default items: oak desk ($180) + lounge chair ($120) + lamp ($65) + dinner set ($90) = **$455 eligible**, plus $65 excluded. Lowest acceptable total is eligible × 0.85 plus excluded items.
3. Click **Make an Offer**. Try:
   - An offer at or above the stated floor → accepted.
   - An offer below the floor → rejected with an explanation.
4. Change quantity so eligible items drop under $250, or raise the merchant threshold, then submit again → bargaining unavailable.
5. Toggle exclusions on the merchant page, save, refresh the cart (or change a quantity to re-render), and confirm the next offer uses the new rules.

Worked spec example (eligible $300, threshold $250, 15% max): accept **$255+**, reject below **$255**. Reproduce it by setting other product quantities to 0 (desk $180 + chair $120) and excluding remaining SKUs if they are still in the cart.

## Limitations (not for real customers)

- Anyone who can open the merchant page can change store rules; there is no authentication or multi-tenant isolation.
- Settings live in a local `data/settings.json` file on one machine.
- The cart is a sample catalog in the browser; quantities are not a real checkout session.
- Offers are evaluated only; nothing is charged, captured, or sent to a processor.
- Rounding is simple two-decimal arithmetic, not tax/shipping-aware.
- No rate limits, audit log, or protection against automated offer probing.
