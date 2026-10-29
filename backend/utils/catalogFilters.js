const ALLOWED_SORTS = new Set(["price_asc", "price_desc", "rating_desc", "name_asc"]);

function getStringFilter(query, key, maxLength) {
  const value = query[key];
  if (value === undefined || value === "") return { value: "", error: null };
  if (typeof value !== "string" || value.trim().length > maxLength) {
    return { value: "", error: `Filter ${key} tidak valid.` };
  }
  return { value: value.trim(), error: null };
}

function getPriceFilter(query, key) {
  const value = query[key];
  if (value === undefined || value === "") return { value: null, error: null };
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value)) {
    return { value: null, error: `Filter ${key} tidak valid.` };
  }
  return { value: Number(value), error: null };
}

function filterCatalogProducts(products, query, getCategories) {
  const filters = {};
  for (const key of ["category", "size", "color", "search", "sort"]) {
    const { value, error } = getStringFilter(query, key, key === "search" ? 100 : 40);
    if (error) return { products: [], error };
    filters[key] = value;
  }

  const minPrice = getPriceFilter(query, "minPrice");
  const maxPrice = getPriceFilter(query, "maxPrice");
  if (minPrice.error || maxPrice.error) {
    return { products: [], error: minPrice.error || maxPrice.error };
  }
  if (minPrice.value !== null && maxPrice.value !== null && minPrice.value > maxPrice.value) {
    return { products: [], error: "Rentang harga tidak valid." };
  }
  if (filters.sort && !ALLOWED_SORTS.has(filters.sort)) {
    return { products: [], error: "Pilihan sortir tidak valid." };
  }

  let inStock = null;
  if (query.inStock !== undefined && query.inStock !== "") {
    if (query.inStock === "true" || query.inStock === "1") inStock = true;
    else if (query.inStock === "false" || query.inStock === "0") inStock = false;
    else return { products: [], error: "Filter inStock tidak valid." };
  }

  const category = filters.category.toLowerCase();
  const size = filters.size.toLowerCase();
  const color = filters.color.toLowerCase();
  const search = filters.search.toLowerCase();
  const filtered = products.filter((product) => {
    const price = Number(product.price);
    if (category && !getCategories(product).some((item) => String(item).toLowerCase() === category)) return false;
    if (size && ![...(product.sizes || []), ...(product.sizesChildren || [])]
      .some((item) => String(item).toLowerCase() === size)) return false;
    if (color && !(product.colors || []).some((item) => String(item).toLowerCase() === color)) return false;
    if (minPrice.value !== null && price < minPrice.value) return false;
    if (maxPrice.value !== null && price > maxPrice.value) return false;
    if (inStock !== null && ((Number(product.stock) > 0) !== inStock)) return false;
    if (search && !`${product.name || ""} ${product.deskripsi || ""}`.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filters.sort === "price_asc") filtered.sort((a, b) => Number(a.price) - Number(b.price));
  if (filters.sort === "price_desc") filtered.sort((a, b) => Number(b.price) - Number(a.price));
  if (filters.sort === "rating_desc") filtered.sort((a, b) => Number(b.avgRating || 0) - Number(a.avgRating || 0));
  if (filters.sort === "name_asc") filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return { products: filtered, error: null };
}

module.exports = { filterCatalogProducts };
