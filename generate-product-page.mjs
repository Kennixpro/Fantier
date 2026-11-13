/**
 * Fantier Static Product Page Generator
 *
 * Generates a single SEO-friendly static HTML page for one product.
 * Uses the exact same URL generation logic as index.html.
 * Reads index.html as template to preserve all checkout functionality.
 *
 * Usage: node generate-product-page.mjs <product-id>
 *
 * Requirements: Node.js 18+ (for built-in fetch)
 */

import fs from "fs";
import path from "path";

// Configuration - must match index.html exactly
const SB_URL = "https://mbkanieqhxryeksalrti.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ia2FuaWVxaHhyeWVrc2FscnRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NDAxNDksImV4cCI6MjA5ODMxNjE0OX0.p1-twI9aD5AGpmbKfU-EZ1FEexdAfEC-ViUApaPDWg4";
const SB_HDR = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };
const SITE_URL = "https://shopfantier.com";

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeJsonLd(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

async function fetchProductById(productId) {
  const url = `${SB_URL}/rest/v1/products?id=eq.${productId}&select=*`;
  const res = await fetch(url, { headers: SB_HDR });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Supabase error (${res.status}): ${errorText}`);
  }

  const data = await res.json();

  if (!data || data.length === 0) {
    throw new Error(`Product with id ${productId} not found`);
  }

  return mapProducts(data)[0];
}

function buildProductBodyContent(product, escapedName, escapedDesc, escapedImg, escapedPrice, categoryLabel) {
  const collectionSlug = getCollectionSlug(product.category);
  const badgeHtml = product.badge ? `<span class="badge badge-${product.badge.toLowerCase()}">${escapeHtml(product.badge)}</span>` : "";

  return `<main class="product-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span class="breadcrumb-separator">/</span>
      <a href="/collections/${collectionSlug}/">${categoryLabel}</a>
      <span class="breadcrumb-separator">/</span>
      <span aria-current="page">${escapedName}</span>
    </nav>
    <div class="product-layout">
      <div class="product-gallery">
        <img class="product-main-img" src="${escapedImg}" alt="${escapedName}" loading="eager" onerror="this.src='https://via.placeholder.com/600x600/141414/E8920A?text=JP'">
      </div>
      <div class="product-info">
        ${badgeHtml}
        <div class="product-category">${categoryLabel}</div>
        <h1>${escapedName}</h1>
        <div class="product-price">₦${escapedPrice}</div>
        <p class="product-desc">${escapedDesc}</p>
        <p style="font-size:.85rem;color:var(--muted);margin-top:1rem">Orders dispatched in 24–48 hours. Nationwide delivery across Nigeria.</p>
        <div class="product-actions">
          <button class="btn btn-primary" onclick="openProductModal(${product.id})" style="width:100%"><i class="fas fa-shopping-bag"></i> Choose Size & Options</button>
        </div>
      </div>
    </div>
  </main>`;
}

function generateProductPageHtml(product, templateHtml) {
  const productUrl = buildProductUrl(product);
  const fullUrl = SITE_URL + productUrl;
  const canonicalUrl = fullUrl;
  const ogImage = product.img || "https://res.cloudinary.com/ysfcm3ow/image/upload/v1790324064/fantier.png";
  const categoryLabel = { national: "National Teams", club: "Clubs", retro: "Retro Kits", kids: "Kids Jerseys", frame: "Moment Frames" }[product.category] || product.category;
  const price = Number(product.price).toLocaleString();
  const availability = product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

  // Product JSON-LD
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": fullUrl + "#product",
    "name": product.name,
    "description": product.desc || "Premium quality product from Fantier.",
    "image": ogImage,
    "sku": String(product.id),
    "offers": {
      "@type": "Offer",
      "@id": fullUrl + "#offer",
      "url": fullUrl,
      "priceCurrency": "NGN",
      "price": String(product.price),
      "availability": availability,
      "seller": {
        "@type": "Organization",
        "name": "Fantier",
        "url": SITE_URL
      }
    },
    "brand": {
      "@type": "Brand",
      "name": "Fantier"
    }
  };

  // BreadcrumbList JSON-LD
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": SITE_URL + "/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": categoryLabel,
        "item": SITE_URL + "/collections/" + getCollectionSlug(product.category) + "/"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": product.name,
        "item": fullUrl
      }
    ]
  };

  // Organization JSON-LD (from homepage)
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": SITE_URL + "/#organization",
    "name": "Fantier",
    "url": SITE_URL + "/",
    "logo": "https://res.cloudinary.com/ysfcm3ow/image/upload/v1790324064/fantier.png",
    "description": "Football jerseys, retro kits, kids jerseys, moment frames and fan gear in Nigeria.",
    "telephone": "+2348185469068",
    "areaServed": { "@type": "Country", "name": "Nigeria" },
    "sameAs": [
      "https://www.instagram.com/fantier.ng/",
      "https://www.tiktok.com/@fantier.ng",
      "https://x.com/fantier_ng"
    ]
  };

  const productJsonLdStr = JSON.stringify(productJsonLd);
  const breadcrumbJsonLdStr = JSON.stringify(breadcrumbJsonLd);
  const organizationJsonLdStr = JSON.stringify(organizationJsonLd);

  // Build product-specific SEO meta tags
  const escapedName = escapeHtml(product.name);
  const escapedDesc = escapeHtml(product.desc || "Premium quality product from Fantier.");
  const escapedCategoryLabel = escapeHtml(categoryLabel);
  const escapedPrice = escapeHtml(price);
  const escapedImg = escapeHtml(product.img || "");
  const escapedOgImage = escapeHtml(ogImage);
  const escapedFullUrl = escapeHtml(fullUrl);
  const escapedCanonicalUrl = escapeHtml(canonicalUrl);

  const seoMetaTags = `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedName} | Fantier</title>
  <meta name="description" content="${escapedDesc} Orders dispatched in 24–48 hours across Nigeria.">
  <meta name="robots" content="index, follow">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="canonical" href="${escapedCanonicalUrl}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${escapedFullUrl}">
  <meta property="og:title" content="${escapedName} | Fantier">
  <meta property="og:description" content="${escapedDesc} Orders dispatched in 24–48 hours across Nigeria.">
  <meta property="og:image" content="${escapedOgImage}">
  <meta property="og:site_name" content="Fantier">
  <meta property="og:locale" content="en_NG">
  <meta property="og:image:alt" content="${escapedName}">
  <meta property="product:price:amount" content="${product.price}">
  <meta property="product:price:currency" content="NGN">
  <meta property="product:availability" content="${product.inStock ? "in_stock" : "out_of_stock"}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@fantier_ng">
  <meta name="twitter:title" content="${escapedName} | Fantier">
  <meta name="twitter:description" content="${escapedDesc} Nationwide delivery across Nigeria.">
  <meta name="twitter:image" content="${escapedOgImage}">
  <meta name="twitter:image:alt" content="${escapedName}">
  <meta name="theme-color" content="#1F7A3D">
  <script type="application/ld+json">${organizationJsonLdStr}</script>
  <script type="application/ld+json">${breadcrumbJsonLdStr}</script>
  <script type="application/ld+json">${productJsonLdStr}</script>`;

  // Body preserved from template; product data injected via pageProduct

  // Build the pageProduct data for JS
  const pageProductData = JSON.stringify(product);

  // Now process the template
  let html = templateHtml;

  // 1. Replace product-specific SEO meta tags in <head> (preserve CSS, fonts, scripts)
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapedName} | Fantier</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapedDesc} Orders dispatched in 24–48 hours across Nigeria.">`);
  html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapedCanonicalUrl}">`);
  html = html.replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="product">`);
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escapedFullUrl}">`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapedName} | Fantier">`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapedDesc} Orders dispatched in 24–48 hours across Nigeria.">`);
  html = html.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapedOgImage}">\n  <meta property="product:price:amount" content="${product.price}">\n  <meta property="product:price:currency" content="NGN">\n  <meta property="product:availability" content="${product.inStock ? "in_stock" : "out_of_stock"}">`);
  html = html.replace(/<meta property="og:site_name"[^>]*>/, `<meta property="og:site_name" content="Fantier">`);
  html = html.replace(/<meta property="og:locale"[^>]*>/, `<meta property="og:locale" content="en_NG">`);
  html = html.replace(/<meta property="og:image:alt"[^>]*>/, `<meta property="og:image:alt" content="${escapedName}">`);
  html = html.replace(/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="summary_large_image">`);
  html = html.replace(/<meta name="twitter:site"[^>]*>/, `<meta name="twitter:site" content="@fantier_ng">`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapedName} | Fantier">`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapedDesc} Nationwide delivery across Nigeria.">`);
  html = html.replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapedOgImage}">`);
  html = html.replace(/<meta name="twitter:image:alt"[^>]*>/, `<meta name="twitter:image:alt" content="${escapedName}">`);
  // Insert breadcrumb and product JSON-LD after the first ld+json script
  const breadcrumbScript = `<script type="application/ld+json">${breadcrumbJsonLdStr}</script>`;
  const productScript = `<script type="application/ld+json">${productJsonLdStr}</script>`;
  html = html.replace(/(<script type="application\/ld\+json">[^<]*<\/script>)/, `$1\n${breadcrumbScript}\n${productScript}`);

  // Inject product-page scoped CSS before </head>
  const productPageCss = `
  <style>
    .product-page { max-width:1280px; margin:2rem auto 0; padding:0 1.5rem; overflow-x:hidden; }
    .product-page .breadcrumb { display:flex; gap:.3rem; align-items:center; font-size:.78rem; color:var(--muted); margin-bottom:1.5rem; }
    .product-page .breadcrumb a { color:var(--muted); text-decoration:none; }
    .product-page .breadcrumb a:hover { color:var(--accent); text-decoration:underline; }
    .product-page .breadcrumb-separator { color:var(--muted); }
    .product-page .product-layout { display:grid; grid-template-columns:1fr; gap:2rem; align-items:flex-start; margin-bottom:2rem; }
    .product-page .product-gallery img { width:100%; height:auto; border-radius:var(--radius); background:var(--surface); display:block; }
    .product-page .product-info h1 { font-size:clamp(1.75rem,3vw,2.5rem); margin:.5rem 0 1rem; line-height:1.2; }
    .product-page .product-category { font-size:.75rem; text-transform:uppercase; letter-spacing:1.5px; color:var(--accent); font-weight:600; margin-bottom:.5rem; }
    .product-page .product-price { font-size:clamp(1.5rem,2.5vw,2rem); font-weight:700; color:var(--text); margin:.5rem 0 1rem; }
    .product-page .product-desc { color:var(--text); line-height:1.6; margin:1rem 0; font-size:1rem; }
    .product-page .badge { display:inline-block; padding:.25rem .6rem; font-size:.7rem; font-weight:700; text-transform:uppercase; border-radius:20px; background:var(--surface); color:var(--accent); margin-bottom:.75rem; }
    .product-page .product-actions button { margin-top:1rem; width:100%; }
    @media (min-width:768px) {
      .product-page .product-layout { grid-template-columns:1fr 1fr; gap:3rem; }
    }
  </style>`;
  html = html.replace(/<\/head>/, productPageCss + "\n  </head>");
  /*
  // 2. Replace homepage body sections (hero through contact) with product-specific content
  // Keep the original footer from index.html
  // Preserve toast and overlay which sit between homepage sections
  const heroStart = html.indexOf('<section class="fv5-hero">');
  const footerStart = html.indexOf('<footer>');
  const footerEnd = html.indexOf('</footer>');
  if (heroStart !== -1 && footerStart !== -1 && footerEnd !== -1) {
    const beforeHero = html.slice(0, heroStart);
    const removedMiddle = html.slice(heroStart, footerStart);
    const afterFooter = html.slice(footerEnd + 9); // include </footer>
    const toastMatch = removedMiddle.match(/<!-- TOAST -->[\s\S]*?<\/div>/);
    const overlayMatch = removedMiddle.match(/<!-- OVERLAY -->[\s\S]*?<\/div>/);
    const toastOverlayHtml = (toastMatch ? toastMatch[0] : "") + (overlayMatch ? overlayMatch[0] : "");
    const footerHtml = html.slice(footerStart, footerEnd + 9);
    html = beforeHero + buildProductBodyContent(product, escapedName, escapedDesc, escapedImg, escapedPrice, categoryLabel) + toastOverlayHtml + footerHtml + afterFooter;
  }
  */

  // 3. Inject pageProduct data into the script section
  const stateVarRegex = /(let products = \[\], cart = \[\], currentProduct = null, modalQty = 1;)/;
  const pageProductInjection = `$1\n    // Product data embedded for immediate use\n    const pageProduct = ${pageProductData};\n    products.push(pageProduct);`;
  html = html.replace(stateVarRegex, pageProductInjection);

  // Product information available in the initial HTML.
  const seoFallback = `
    <noscript>
      <style>
        body > :not(#fantier-seo-product):not(noscript) {
          display: none !important;
        }
        #fantier-seo-product {
          display: block !important;
        }
      </style>
    </noscript>

    <section id="fantier-seo-product" aria-label="Product information">
      <a href="/">Fantier Home</a>
      <h1>${escapedName}</h1>
      ${escapedImg ? `<img src="${escapedImg}" alt="${escapedName}">` : ""}
      <p><strong>₦${escapedPrice}</strong></p>
      <p>${escapedDesc}</p>
      <p>${product.inStock ? "In stock" : "Out of stock"}</p>
      <p>Enable JavaScript to choose options and place an order.</p>
    </section>`;

  html = html.replace(/<\/head>/i, `
    <style id="fantier-seo-fallback-css">
      #fantier-seo-product {
        display: none !important;
        max-width: 960px;
        margin: 2rem auto;
        padding: 1.5rem;
        font: 16px/1.6 Arial, sans-serif;
        color: #171717;
        background: #fff;
      }
      #fantier-seo-product img {
        display: block;
        width: 100%;
        max-width: 480px;
        height: auto;
        margin: 1rem 0;
      }
    </style>
  </head>`);

  html = html.replace(/<\/body>/i, `${seoFallback}\n</body>`);

  return html;
}

async function main() {
  const productId = process.argv[2];

  if (!productId) {
    console.error("Usage: node generate-product-page.mjs <product-id>");
    console.error("Example: node generate-product-page.mjs 10");
    process.exit(1);
  }

  console.log(`Fetching product ${productId} from Supabase...`);

  let product;
  try {
    product = await fetchProductById(productId);
  } catch (error) {
    console.error("Failed to fetch product:", error.message);
    process.exit(1);
  }

  console.log(`Product: ${product.name} (ID: ${product.id})`);
  console.log(`Category: ${product.category}`);
  console.log(`Price: ₦${product.price}`);
  console.log(`In stock: ${product.inStock}`);

  const productUrl = buildProductUrl(product);
  const fullUrl = SITE_URL + productUrl;

  console.log(`\nProduct URL: ${productUrl}`);
  console.log(`Full URL: ${fullUrl}`);

  // Read the template index.html
  const templatePath = path.join(process.cwd(), "index.html");
  const templateHtml = fs.readFileSync(templatePath, "utf-8");

  // Generate HTML using template
  const html = generateProductPageHtml(product, templateHtml);

  // Determine output path
  const outputDir = path.join(process.cwd(), "collections", getCollectionSlug(product.category), "products", getProductSlug(product));
  const outputFile = path.join(outputDir, "index.html");

  // Create directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Write file
  fs.writeFileSync(outputFile, html, "utf-8");

  console.log(`\nProduct page written to: ${outputFile}`);
  console.log(`\nTest locally with: npx serve . -l 8888`);
  console.log(`Then visit: http://localhost:8888${productUrl}/`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});