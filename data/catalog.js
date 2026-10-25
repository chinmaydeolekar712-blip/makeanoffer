/** Sample Wholesale Catalog — Industrial Packaging & Shipping Supplies */
const CATALOG = [
  {
    id: "oak-desk",
    name: 'Corrugated Shipping Cartons (Bundle of 25, 18x14x12")',
    description: "200# test ECT-32 single-wall kraft corrugated boxes, ships flat for high-volume order packing",
    unitPrice: 180,
    defaultQty: 1,
  },
  {
    id: "wool-chair",
    name: "Heavy-Duty Stretch Wrap Film (Case of 4 Rolls, 80 Gauge)",
    description: "Cast industrial hand film with high puncture resistance and silent unwind for pallet stabilization",
    unitPrice: 120,
    defaultQty: 1,
  },
  {
    id: "linen-lamp",
    name: "Reinforced Water-Activated Kraft Tape (Case of 10 Rolls)",
    description: "Fiberglass-reinforced gummed sealing tape creating tamper-evident fiber-tear bond on cartons",
    unitPrice: 65,
    defaultQty: 1,
  },
  {
    id: "ceramic-set",
    name: "Biodegradable Cushioning Loose Fill (15 cu. ft. Bag)",
    description: "Cornstarch-based anti-static packing peanuts, dissolves in water and complies with commercial transit safety",
    unitPrice: 90,
    defaultQty: 1,
  },
  {
    id: "gift-card",
    name: 'Self-Seal Bubble Mailers #2 (Carton of 100, 8.5x12")',
    description: "Multi-layer golden kraft padded envelopes with high-slip 3/16 inch air cushioning lining",
    unitPrice: 50,
    defaultQty: 1,
  },
  {
    id: "sale-vase",
    name: "Manual Steel Strapping & Buckle Kit (Commercial Pack)",
    description: "High-tensile steel banding coil with 100 heavy-gauge wire buckles for palletized cargo",
    unitPrice: 35,
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
