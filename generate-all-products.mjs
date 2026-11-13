/**
 * Fantier SEO batch driver.
 *
 * Uses the existing sitemap.xml and generate-product-page.mjs. No packages needed.
 * Default: READ-ONLY preview of product IDs found in sitemap.
 * To generate: node generate-all-products.mjs --run
 * To test only one product: node generate-all-products.mjs --run --limit=1
 *
 * IMPORTANT: Regenerate sitemap.xml first using node generate-sitemap.mjs
 * whenever products have been added/removed in Supabase.
 * This script does not deploy or edit index.html, checkout, or Supabase.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sitemapPath = path.join(root, 'sitemap.xml');
const generatorPath = path.join(root, 'generate-product-page.mjs');
const run = process.argv.includes('--run');
const rawLimit = process.argv.find(a => a.startsWith('--limit='));
const limit = rawLimit ? Number(rawLimit.slice('--limit='.length)) : Infinity;

if (!Number.isInteger(limit) && limit !== Infinity || limit < 1) {
  console.error('Invalid --limit; use --limit=1 or another positive integer.');
  process.exit(1);
}
if (!fs.existsSync(sitemapPath) || !fs.existsSync(generatorPath) || !fs.existsSync(path.join(root, 'index.html'))) {
  console.error('Run this in the Fantier project root. Required: sitemap.xml, index.html and generate-product-page.mjs.');
  process.exit(1);
}

const sitemap = fs.readFileSync(sitemapPath, 'utf8');
const entries = [];
const seen = new Set();
for (const match of sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
  let url;
  try { url = new URL(match[1].replace(/&amp;/g, '&')); } catch { continue; }
  if (url.hostname !== 'shopfantier.com') continue;
  const pathMatch = url.pathname.match(/^\/collections\/[^/]+\/products\/[^/]+-(\d+)\/?$/);
  if (!pathMatch) continue;
  const id = pathMatch[1];
  if (seen.has(id)) continue;
  seen.add(id);
  entries.push({ id, pathname: url.pathname.replace(/\/$/, '') });
}
if (!entries.length) {
  console.error('No product URLs found in sitemap.xml. Nothing changed.');
  process.exit(1);
}

const targets = entries.slice(0, limit);
console.log(`Found ${entries.length} unique product URLs in sitemap.xml.`);
console.log(`Selected ${targets.length} product(s).`);
if (!run) {
  console.log('\nREAD-ONLY PREVIEW — no files were changed.');
  for (const { id, pathname } of targets) console.log(`  ${id}: ${pathname}`);
  console.log('\nAfter confirming this list, test: node generate-all-products.mjs --run --limit=1');
  console.log('For the full catalogue (later): node generate-all-products.mjs --run');
  process.exit(0);
}

// Do not let a broken or outdated generator silently introduce the experimental
// standalone product page. Every resulting file must retain the original hero
// and checkout/modal markup; on failure, restore that product's prior HTML.
let completed = 0;
for (const { id, pathname } of targets) {
  const file = path.join(root, pathname.slice(1), 'index.html');
  const oldContent = fs.existsSync(file) ? fs.readFileSync(file) : null;
  console.log(`\n[${completed + 1}/${targets.length}] Generating product ${id}...`);
  const result = spawnSync(process.execPath, [generatorPath, id], {
    cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 120000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  let error = null;
  if (result.error) error = result.error.message;
  else if (result.status !== 0) error = `generator exited with ${result.status}`;
  else if (!fs.existsSync(file)) error = `expected product HTML not found: ${file}`;
  else {
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('<section class="fv5-hero">')) error = 'original Fantier homepage hero was not preserved';
    else if (html.includes('<main class="product-page">')) error = 'experimental product-page layout detected';
    else if (!html.includes('"@type":"Product"')) error = 'Product JSON-LD not found';
    else if (!html.includes('<meta property="og:type" content="product">')) error = 'product-specific Open Graph metadata not found';
    else if (!html.includes('id="checkoutModal"')) error = 'original checkout markup not found';
  }
  if (error) {
    // Restore only the current product file. Do not touch other project files.
    if (oldContent !== null) fs.writeFileSync(file, oldContent);
    else if (fs.existsSync(file)) fs.unlinkSync(file);
    console.error(`\nSTOPPED at product ${id}: ${error}`);
    console.error('This product file was restored (or removed if it did not exist before).');
    console.error(`${completed} previous product(s) may have been generated; no deployment was performed.`);
    process.exit(1);
  }
  completed++;
}
console.log(`\nGenerated ${completed} product page(s). No deployment performed.`);
console.log('Verify product source and original modal locally before any Netlify preview.');
