const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const STATE_FILE = path.join(__dirname, "state.json");
const PRODUCTS_FILE = path.join(__dirname, "products.json");

// ── helpers ──────────────────────────────────────────────────────────────────

function cleanUrl(raw) {
  try {
    const u = new URL(raw.trim());
    return u.origin + u.pathname.replace(/\/$/, "").replace(/\.json$/, "");
  } catch {
    return raw.trim().replace(/\?.*$/, "").replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const options = { ...opts, headers: { "User-Agent": "Mozilla/5.0 (compatible; ShopifyMonitor/1.0)", ...(opts.headers || {}) } };
    const req = lib.request(url, options, (res) => {
      // follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetch(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Request timeout")); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
}

// ── stock detection ───────────────────────────────────────────────────────────

async function getJsonStock(baseUrl) {
  try {
    const res = await fetch(baseUrl + ".json", { headers: { Accept: "application/json" } });
    if (res.status !== 200) return null;
    const data = JSON.parse(res.body);
    if (!data.product) return null;
    const variants = data.product.variants || [];
    const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
    const inStock = variants.some(
      (v) => v.available === true && (v.inventory_quantity === undefined || v.inventory_quantity > 0)
    );
    return {
      title: data.product.title,
      inStock,
      price: prices.length ? Math.min(...prices) : null,
      variants: variants.length,
      image: data.product.images?.[0]?.src || null,
    };
  } catch (e) {
    console.log(`  JSON fetch failed: ${e.message}`);
    return null;
  }
}

async function getPageStock(baseUrl) {
  try {
    const res = await fetch(baseUrl, {});
    if (res.status !== 200) return null;
    const html = res.body;

    const outPatterns = [
      /notify\s+me\s+when\s+available/i,
      /sold[\s_-]?out/i,
      /out[\s_-]of[\s_-]stock/i,
      /"availability"\s*:\s*"https:\/\/schema\.org\/OutOfStock"/i,
      /data-sold-out="true"/i,
    ];
    for (const p of outPatterns) if (p.test(html)) return false;

    const inPatterns = [
      /add[\s_-]to[\s_-]cart/i,
      /add[\s_-]to[\s_-]bag/i,
      /"availability"\s*:\s*"https:\/\/schema\.org\/InStock"/i,
    ];
    for (const p of inPatterns) if (p.test(html)) return true;

    return null;
  } catch (e) {
    console.log(`  Page scrape failed: ${e.message}`);
    return null;
  }
}

// ── discord ───────────────────────────────────────────────────────────────────

async function sendDiscord(embed) {
  if (!WEBHOOK_URL) { console.log("  No webhook set — skipping Discord"); return; }
  try {
    const body = JSON.stringify({ embeds: [embed] });
    const u = new URL(WEBHOOK_URL);
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      body,
    });
    console.log("  Discord alert sent");
  } catch (e) {
    console.log(`  Discord failed: ${e.message}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function checkProduct(product, state) {
  const base = cleanUrl(product.url);
  const name = product.name || base;
  console.log(`Checking: ${name}`);

  const [jsonData, pageStock] = await Promise.all([getJsonStock(base), getPageStock(base)]);

  if (!jsonData) { console.log("  Could not fetch product data"); return; }

  // page scrape wins over JSON if it gave a definitive answer
  const inStock = pageStock !== null ? pageStock : jsonData.inStock;
  const stockSource = pageStock !== null ? "page" : "json";

  const prev = state[base] || {};
  const changes = [];

  if (prev.inStock !== undefined && prev.inStock !== inStock) {
    const msg = inStock ? "🟢 Back in stock!" : "🔴 Went out of stock";
    changes.push({ name: "Stock", value: msg, inline: true });
    console.log(`  STOCK CHANGE: ${msg}`);
  }

  if (prev.price !== undefined && jsonData.price !== null && prev.price !== jsonData.price) {
    const diff = jsonData.price - prev.price;
    const pct = ((diff / prev.price) * 100).toFixed(1);
    const msg = diff < 0
      ? `📉 Dropped to $${jsonData.price.toFixed(2)} (${pct}%)`
      : `📈 Rose to $${jsonData.price.toFixed(2)} (+${pct}%)`;
    changes.push({ name: "Price", value: msg, inline: true });
    console.log(`  PRICE CHANGE: ${msg}`);
  }

  if (prev.inStock === undefined) {
    console.log(`  First check — ${inStock ? "IN STOCK" : "out of stock"} | $${jsonData.price?.toFixed(2)} [via ${stockSource}]`);
  } else {
    console.log(`  ${inStock ? "in stock" : "out of stock"} | $${jsonData.price?.toFixed(2)} [via ${stockSource}] — no changes`);
  }

  // save new state
  state[base] = { inStock, price: jsonData.price, title: jsonData.title, checkedAt: new Date().toISOString() };

  if (changes.length) {
    await sendDiscord({
      title: jsonData.title || name,
      url: base,
      color: inStock ? 0x4ade80 : 0xf87171,
      fields: changes,
      thumbnail: jsonData.image ? { url: jsonData.image } : undefined,
      footer: { text: `Shopify Monitor • ${new Date().toUTCString()}` },
    });
  }
}

async function main() {
  console.log(`\n=== Shopify Monitor — ${new Date().toUTCString()} ===`);
  const products = loadProducts();
  const state = loadState();
  console.log(`Monitoring ${products.length} product(s)\n`);

  for (const product of products) {
    await checkProduct(product, state);
    console.log("");
  }

  saveState(state);
  console.log("Done.");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
