from pathlib import Path

path = Path(__file__).with_name("render.js")
source = path.read_text(encoding="utf-8")

helper = r'''
async function addVisibleStorefrontPrices(products) {
  const cheerio = require('cheerio');
  let cursor = 0;
  const workers = Math.min(8, Math.max(1, products.length));

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= products.length) return;
      const product = products[index];
      try {
        const response = await fetch(`${STORE}/products/${product.handle}`, {
          headers: { 'User-Agent': 'Sahara-Catalogue-Builder/1.0' },
        });
        if (!response.ok) continue;
        const html = await response.text();
        const $ = cheerio.load(html);
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const titleIndex = bodyText.indexOf(product.title);
        const nearbyText = titleIndex >= 0 ? bodyText.slice(titleIndex, titleIndex + 1400) : bodyText;
        let match = nearbyText.match(/\bAED\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);

        if (!match) {
          const metaPrice = $('meta[property="product:price:amount"], meta[property="og:price:amount"]').first().attr('content');
          if (metaPrice) match = [metaPrice, metaPrice];
        }

        const visiblePrice = Number.parseFloat(String(match?.[1] || '').replace(/,/g, ''));
        if (Number.isFinite(visiblePrice)) product.storefrontPrice = visiblePrice;
      } catch (error) {
        console.warn(`Visible-price lookup failed for ${product.handle}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
}
'''

needle = "function productPrice(product) {"
if helper.strip() not in source:
    if needle not in source:
        raise SystemExit("Could not locate productPrice function")
    source = source.replace(needle, helper + "\n" + needle, 1)

old_price_start = "function productPrice(product) {\n  const values = (product.variants || [])"
new_price_start = """function productPrice(product) {
  if (Number.isFinite(product.storefrontPrice)) {
    const value = product.storefrontPrice;
    const formatted = new Intl.NumberFormat('en-AE', {
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
    return `AED ${formatted}`;
  }
  const values = (product.variants || [])"""
if old_price_start in source:
    source = source.replace(old_price_start, new_price_start, 1)

old_main = "  const products = await fetchProducts();\n  if (!products.length)"
new_main = "  const products = await fetchProducts();\n  await addVisibleStorefrontPrices(products);\n  if (!products.length)"
if old_main in source:
    source = source.replace(old_main, new_main, 1)

path.write_text(source, encoding="utf-8")
print("Patched renderer to use visible storefront prices.")
