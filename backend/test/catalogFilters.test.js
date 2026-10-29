const test = require("node:test");
const assert = require("node:assert/strict");
const { filterCatalogProducts } = require("../utils/catalogFilters");

const products = [
  { id: 1, name: "Boxy Tee", price: 100000, stock: 2, colors: ["Black"], sizes: ["M", "L"], avgRating: 4.5 },
  { id: 2, name: "Long Sleeve", price: 150000, stock: 0, colors: ["White"], sizes: ["L"], avgRating: 4.9 },
];
const categories = (product) => product.name.toLowerCase().includes("sleeve") ? ["longsleeve"] : ["shortsleeve"];

test("keeps the default catalog unchanged when no filters are supplied", () => {
  assert.deepEqual(filterCatalogProducts(products, {}, categories), { products, error: null });
});

test("filters by category, size, color, availability, and price", () => {
  const result = filterCatalogProducts(products, {
    category: "shortsleeve",
    size: "M",
    color: "black",
    inStock: "true",
    minPrice: "90000",
    maxPrice: "120000",
  }, categories);
  assert.deepEqual(result.products.map((product) => product.id), [1]);
  assert.equal(result.error, null);
});

test("supports text search and deterministic sorting", () => {
  assert.deepEqual(
    filterCatalogProducts(products, { search: "long", sort: "price_asc" }, categories).products.map((product) => product.id),
    [2],
  );
  assert.deepEqual(
    filterCatalogProducts(products, { sort: "rating_desc" }, categories).products.map((product) => product.id),
    [2, 1],
  );
});

test("rejects malformed filters and reversed price ranges", () => {
  assert.match(filterCatalogProducts(products, { inStock: "maybe" }, categories).error, /inStock/);
  assert.match(filterCatalogProducts(products, { sort: "random" }, categories).error, /sortir/);
  assert.match(filterCatalogProducts(products, { minPrice: "200000", maxPrice: "100000" }, categories).error, /harga/);
});
