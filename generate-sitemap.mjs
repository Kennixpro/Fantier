/**
 * Fantier Sitemap Generator
 *
 * Fetches products from Supabase and generates sitemap.xml using the exact
 * same URL generation logic as the frontend (index.html).
 *
 * Usage: node generate-sitemap.mjs
 *
 * Requirements: Node.js 18+ (for built-in fetch)
 */

// Configuration - must match index.html exactly
const SB_URL = "https://mbkanieqhxryeksalrti.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ia2FuaWVxaHhyeWVrc2FscnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NDAxNDksImV4cCI6MjA5ODMxNjE0OX0.p1-twI9aD5AGpmbKfU-EZ1FEexdAfEC-ViUApaPDWg4";
const SB_HDR = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };
const SITE_URL = "https://shopfantier.com";
const SITEMAP_PATH = "sitemap.xml";

// URL generation logic - MUST match index.html exactly
const COLLECTION_SLUGS = {
  national: "national-teams",
  club: "clubs",
  retro: "retro-kits",
  kids: "kids-jerseys",
  frame: "moment-frames"
};

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCollectionSlug(category) {
  return COLLECTION_SLUGS[category] || slugify(category);
}

function getProductSlug(product) {
  const baseSlug = slugify(product.name);
  const idSuffix = String(product.id).slice(-6);
  return `${baseSlug}-${idSuffix}`;
}

function buildProductUrl(product) {
  const collectionSlug = getCollectionSlug(product.category);
  const productSlug = getProductSlug(product);
  return `/collections/${collectionSlug}/products/${productSlug}`;
}

function mapProducts(data) {
  return data.map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
    img: p.img,
    desc: p.description,
    sizes: p.sizes || null,
    dimensions: p.dimensions || null,
    badge: p.badge || null,
    inStock: p.in_stock !== false
  }));
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, String.fromCharCode(38) + "quot;")
    .replace(/'/g, "&apos;");
}

async function fetchAllProducts() {
  const allProducts = [];
  let offset = 0;
  const limit = 1000; // Supabase max per request

  while (true) {
    const url = `${SB_URL}/rest/v1/products?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: SB_HDR });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Supabase error (${res.status}): ${errorText}`);
    }

    const data = await res.json();

    if (!data || data.length === 0) {
      break;
    }

    allProducts.push(...data);

    if (data.length < limit) {
      break;
    }

    offset += limit;
  }

  return allProducts;
}

function generateSitemap(products) {
  const urls = new Set();

  // Homepage
  urls.add(SITE_URL + "/");

  // Product URLs - only publicly visible products
  for (const product of products) {
    if (!product.inStock) {
      console.log(`  Skipping out-of-stock product: ${product.name} (id: ${product.id})`);
      continue;
    }

    const productPath = buildProductUrl(product);
    const fullUrl = SITE_URL + productPath;

    if (urls.has(fullUrl)) {
      console.warn(`  Duplicate URL detected: ${fullUrl}`);
    } else {
      urls.add(fullUrl);
    }
  }

  // Generate XML
  const urlEntries = Array.from(urls).map(url =>
    `  <url>\n    <loc>${escapeXml(url)}</loc>\n  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

async function main() {
  console.log("Fetching products from Supabase...");

  let rawProducts;
  try {
    rawProducts = await fetchAllProducts();
  } catch (error) {
    console.error("Failed to fetch products:", error.message);
    console.error("Keeping existing sitemap.xml unchanged.");
    process.exit(1);
  }

  console.log(`Fetched ${rawProducts.length} products from Supabase.`);

  const products = mapProducts(rawProducts);
  const visibleProducts = products.filter(p => p.inStock);
  console.log(`${visibleProducts.length} products are publicly visible (in_stock !== false).`);

  const sitemapXml = generateSitemap(products);

  // Write sitemap
  const fs = await import("fs");
  fs.writeFileSync(SITEMAP_PATH, sitemapXml, "utf-8");

  console.log(`\nSitemap written to ${SITEMAP_PATH}`);
  console.log(`Total URLs: ${visibleProducts.length + 1} (homepage + ${visibleProducts.length} products)`);

  // Show sample URLs
  console.log("\nSample product URLs:");
  let count = 0;
  for (const product of visibleProducts) {
    if (count >= 3) break;
    console.log(`  ${SITE_URL}${buildProductUrl(product)}`);
    count++;
  }

  // Show excluded products
  const excluded = products.filter(p => !p.inStock);
  if (excluded.length > 0) {
    console.log(`\nExcluded ${excluded.length} out-of-stock/hidden products:`);
    for (const p of excluded) {
      console.log(`  - ${p.name} (id: ${p.id}, category: ${p.category})`);
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});