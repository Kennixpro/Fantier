/** Package only Fantier's public site files for Netlify; never deploys. */
import { existsSync } from 'node:fs';
import { readFile, copyFile, mkdir, rm, rename } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const staging = path.join(root, '.fantier-dist-staging');
const publicFiles = [
  'index.html', 'admin.html', 'favicon.png', 'apple-touch-icon.png',
  'robots.txt', 'sitemap.xml', '_redirects',
];

// Validate all source files BEFORE touching an existing dist directory.
for (const file of publicFiles) {
  if (!existsSync(path.join(root, file))) {
    throw new Error(`Missing website file: ${file}`);
  }
}
const xml = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const productPaths = new Set();
for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
  const url = new URL(match[1].replace(/&amp;/g, '&'));
  if (url.hostname !== 'shopfantier.com') {
    throw new Error(`Unexpected sitemap domain: ${url.hostname}`);
  }
  if (url.pathname === '/') continue;
  const rel = url.pathname.replace(/^\/+|\/+$/g, '');
  if (!/^collections\/[a-z0-9-]+\/products\/[a-z0-9-]+$/.test(rel)) {
    throw new Error(`Unexpected sitemap path: ${url.pathname}`);
  }
  if (!existsSync(path.join(root, rel, 'index.html'))) {
    throw new Error(`Product HTML missing: ${rel}/index.html`);
  }
  productPaths.add(rel);
}
if (productPaths.size === 0) throw new Error('No products in sitemap; refusing to publish an empty catalogue.');

// Create a fresh staging directory containing ONLY allowed public files.
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
try {
  for (const file of publicFiles) {
    await copyFile(path.join(root, file), path.join(staging, file));
  }
  for (const rel of productPaths) {
    const targetDir = path.join(staging, rel);
    await mkdir(targetDir, { recursive: true });
    await copyFile(path.join(root, rel, 'index.html'), path.join(targetDir, 'index.html'));
  }
  // Only this script-owned build directory is replaced; source files are never deleted.
  await rm(dist, { recursive: true, force: true });
  await rename(staging, dist);
} catch (err) {
  await rm(staging, { recursive: true, force: true });
  throw err;
}
console.log(`Prepared dist/ with ${productPaths.size} product pages and ${publicFiles.length} root files.`);
console.log('No changes to source files, payments, Git, or the live site.');
