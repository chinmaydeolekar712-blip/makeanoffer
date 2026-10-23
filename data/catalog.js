/** Sample catalog used by both the cart UI and merchant exclusion list. */
const CATALOG = [
  {
    id: "oak-desk",
    name: "Solid oak writing desk",
    description: "48-inch desk with cable tray",
    unitPrice: 180,
    defaultQty: 1,
  },
  {
    id: "wool-chair",
    name: "Wool lounge chair",
    description: "Mid-century armchair in oat wool",
    unitPrice: 120,
    defaultQty: 1,
  },
  {
    id: "linen-lamp",
    name: "Linen floor lamp",
    description: "Brass stem, linen shade",
    unitPrice: 65,
    defaultQty: 1,
  },
  {
    id: "ceramic-set",
    name: "Stoneware dinner set",
    description: "Service for four, matte glaze",
    unitPrice: 90,
    defaultQty: 1,
  },
  {
    id: "gift-card",
    name: "Store gift card",
    description: "Fixed-value card — not eligible for bargaining",
    unitPrice: 40,
    defaultQty: 1,
  },
  {
    id: "sale-vase",
    name: "Clearance ceramic vase",
    description: "Final sale item — not eligible for bargaining",
    unitPrice: 25,
    defaultQty: 1,
  },
];

function getCatalog() {
  return CATALOG.map((item) => ({ ...item }));
}

function getProductById(id) {
  return CATALOG.find((item) => item.id === id) || null;
}

module.exports = { CATALOG, getCatalog, getProductById };
