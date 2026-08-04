const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const STORE = 'https://sahara.shopping';
const OUTPUT = path.join(__dirname, 'Sahara_Product_Catalogue_With_Photos.pdf');

const palette = {
  paper: '#fffdf9',
  cream: '#f7f1e7',
  ink: '#17140f',
  gold: '#b98b4f',
  green: '#24483b',
  muted: '#6e665e',
  line: '#d8cdbd',
  soft: '#efe5d6',
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resizedImage(url, width = 900) {
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
}

async function fetchProducts() {
  const all = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`${STORE}/products.json?limit=250&page=${page}`, {
      headers: { 'User-Agent': 'Sahara-Catalogue-Builder/1.0' },
    });
    if (!response.ok) throw new Error(`Store feed failed: ${response.status}`);
    const json = await response.json();
    const products = Array.isArray(json.products) ? json.products : [];
    all.push(...products);
    if (products.length < 250) break;
  }
  return all.filter((product) => product && product.title && product.images?.length);
}

function categoryFor(product) {
  const text = `${product.title || ''} ${product.product_type || ''}`.toLowerCase();
  if (/sandal/.test(text)) return 'Artisan Sandals';
  if (/scarf|pareo|wearable/.test(text)) return 'Scarves & Wearables';
  if (/tote|crossbody|\bbag\b|\bhat\b|wallet/.test(text)) return 'Woven & Carry';
  if (/earring|bracelet|\bcuff\b|headband|waist bead|waist strand|jewelry|jewellery|necklace|ring|keychain/.test(text)) {
    return 'Jewellery & Accessories';
  }
  if (/sculpture|napkin|coaster|salt|pepper|basket|ashtray|candle|keepsake|table set|kitchen|home|treasure pot/.test(text)) {
    return 'Home & Hospitality';
  }
  if (/gift|\bset\b|\bpack\b|magnet|fan/.test(text)) return 'Gifts & Complete Sets';
  return 'Gifts & Small Objects';
}

function productPrice(product) {
  const values = (product.variants || [])
    .map((variant) => Number.parseFloat(variant.price))
    .filter((price) => Number.isFinite(price));
  if (!values.length) return 'Price on request';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const format = (value) => new Intl.NumberFormat('en-AE', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
  return min === max ? `AED ${format(min)}` : `From AED ${format(min)}`;
}

function chunks(array, size) {
  const output = [];
  for (let i = 0; i < array.length; i += size) output.push(array.slice(i, i + size));
  return output;
}

function productCard(product, category) {
  const image = resizedImage(product.images?.[0]?.src || product.image?.src || '', 900);
  const type = product.product_type || category;
  return `
    <article class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${escapeHtml(image)}" alt="${escapeHtml(product.images?.[0]?.alt || product.title)}" />
        <div class="image-fallback">SAHARA</div>
      </div>
      <div class="product-copy">
        <div class="product-type">${escapeHtml(type)}</div>
        <h3>${escapeHtml(product.title)}</h3>
        <div class="product-bottom">
          <span class="price">${escapeHtml(productPrice(product))}</span>
          <span class="small-batch">SMALL BATCH</span>
        </div>
      </div>
    </article>`;
}

function footer(pageNumber) {
  return `
    <footer class="footer">
      <span>SAHARA PRODUCT CATALOGUE &nbsp; | &nbsp; Retail prices in AED &nbsp; | &nbsp; sahara.shopping</span>
      <span>${pageNumber}</span>
    </footer>`;
}

function categoryPage(category, products, pageNumber, continued = false) {
  const cards = products.map((product) => productCard(product, category)).join('');
  return `
    <section class="page catalogue-page">
      <header class="page-header">
        <div>
          <div class="kicker">${continued ? 'COLLECTION CONTINUED' : 'CURRENT RETAIL COLLECTION'}</div>
          <h2>${escapeHtml(category)}</h2>
        </div>
        <div class="page-brand">SAHARA</div>
      </header>
      <div class="product-grid">${cards}</div>
      ${footer(pageNumber)}
    </section>`;
}

async function buildHtml(products) {
  const qr = await QRCode.toDataURL(STORE, {
    margin: 1,
    width: 420,
    color: { dark: palette.ink, light: '#ffffff' },
  });

  const orderedCategories = [
    'Home & Hospitality',
    'Gifts & Complete Sets',
    'Woven & Carry',
    'Jewellery & Accessories',
    'Scarves & Wearables',
    'Artisan Sandals',
    'Gifts & Small Objects',
  ];

  const grouped = new Map(orderedCategories.map((category) => [category, []]));
  for (const product of products) {
    const category = categoryFor(product);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(product);
  }
  for (const items of grouped.values()) {
    items.sort((a, b) => a.title.localeCompare(b.title, 'en'));
  }

  const heroHandles = [
    'beaded-wooden-napkin-holder',
    'hand-carved-wooden-buffalo-sculpture-one-of-one',
    'sahara-woven-hat-tote-set',
  ];
  const heroes = heroHandles
    .map((handle) => products.find((product) => product.handle === handle))
    .filter(Boolean);
  while (heroes.length < 3 && products[heroes.length]) heroes.push(products[heroes.length]);

  let pageNumber = 1;
  const pages = [];

  pages.push(`
    <section class="page cover-page">
      <div class="cover-top">
        <div class="cover-brand">SAHARA</div>
        <div class="cover-tagline">CURATED IN AFRICA · PREPARED IN THE UAE</div>
      </div>
      <div class="cover-body">
        <div class="cover-copy">
          <div class="kicker">CURRENT RETAIL EDITION</div>
          <h1>PRODUCT<br/>CATALOGUE</h1>
          <p>Handmade objects, gifting, adornment and small-batch pieces selected with care for homes, hospitality spaces and distinctive retail.</p>
          <div class="cover-meta">LIVE STORE PRICES · AED · 2026</div>
        </div>
        <div class="cover-gallery">
          ${heroes.map((product, index) => `
            <div class="hero hero-${index + 1}">
              <img src="${escapeHtml(resizedImage(product.images?.[0]?.src, 1000))}" alt="${escapeHtml(product.title)}" />
            </div>`).join('')}
        </div>
      </div>
      <div class="cover-contact">
        <div>
          <strong>SAHARA SHOPPING</strong>
          <span>sahara.shopping &nbsp; | &nbsp; +971 52 194 8311</span>
          <span>hello@sahara.shopping &nbsp; | &nbsp; Sharjah, UAE</span>
        </div>
        <div class="cover-qr"><img src="${qr}" alt="Scan Sahara Shopping"/><small>SCAN STORE</small></div>
      </div>
    </section>`);

  pageNumber += 1;
  const categorySummary = orderedCategories
    .filter((category) => grouped.get(category)?.length)
    .map((category, index) => `
      <div class="collection-row">
        <span>${String(index + 1).padStart(2, '0')}</span>
        <strong>${escapeHtml(category)}</strong>
        <em>${grouped.get(category).length} products</em>
      </div>`).join('');

  pages.push(`
    <section class="page intro-page">
      <header class="page-header intro-header">
        <div>
          <div class="kicker">THE SAHARA EDIT</div>
          <h2>Objects with a story</h2>
        </div>
        <div class="page-brand">SAHARA</div>
      </header>
      <div class="intro-lead">
        <p>Sahara curates African jewellery, gifts, woven craft and home pieces in small quantities, then prepares each order locally in the UAE.</p>
      </div>
      <div class="intro-columns">
        <div class="intro-panel">
          <h3>For retail</h3>
          <p>Gift stores, concept shops, museum retail, boutiques and handmade-product specialists.</p>
        </div>
        <div class="intro-panel">
          <h3>For hospitality</h3>
          <p>Cafés, restaurants, hotels, lounges, spas, guest gifting and distinctive reception styling.</p>
        </div>
      </div>
      <div class="collection-list">${categorySummary}</div>
      <div class="ordering-note">
        <strong>Ordering note</strong>
        <p>Prices shown are the current live selling prices on sahara.shopping. Availability is small-batch and may change. Wholesale, consignment, venue quantities and custom sourcing are quoted separately after the buyer confirms the required products and quantities.</p>
      </div>
      ${footer(pageNumber)}
    </section>`);

  for (const category of orderedCategories) {
    const items = grouped.get(category) || [];
    if (!items.length) continue;
    const groups = chunks(items, 4);
    groups.forEach((group, index) => {
      pageNumber += 1;
      pages.push(categoryPage(category, group, pageNumber, index > 0));
    });
  }

  pageNumber += 1;
  pages.push(`
    <section class="page enquiry-page">
      <header class="page-header">
        <div>
          <div class="kicker">BUYER ENQUIRY</div>
          <h2>Build your shortlist</h2>
        </div>
        <div class="page-brand">SAHARA</div>
      </header>
      <p class="enquiry-lead">Mark the products you would like to review, then send the list to Sahara for availability, quantities and a tailored proposal.</p>
      <table class="enquiry-table">
        <thead><tr><th>Product / collection</th><th>Qty</th><th>Use / store area</th><th>Notes</th></tr></thead>
        <tbody>${Array.from({ length: 10 }, () => '<tr><td></td><td></td><td></td><td></td></tr>').join('')}</tbody>
      </table>
      <div class="closing-card">
        <div>
          <div class="kicker">LET'S CREATE SOMETHING MEMORABLE</div>
          <h3>Sahara Shopping</h3>
          <p>WhatsApp: +971 52 194 8311<br/>Email: hello@sahara.shopping<br/>Web: sahara.shopping<br/>Sharjah, UAE</p>
        </div>
        <div class="closing-qr"><img src="${qr}" alt="Scan Sahara Shopping"/><span>SCAN THE FULL STORE</span></div>
      </div>
      ${footer(pageNumber)}
    </section>`);

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Sahara Product Catalogue</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: ${palette.paper}; color: ${palette.ink}; }
      body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; background: ${palette.paper}; }
      .page:last-child { page-break-after: auto; }
      .kicker { font-size: 8.5pt; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; color: ${palette.gold}; }
      h1, h2, h3, p { margin: 0; }
      .page-header { height: 29mm; margin: 0 15mm; padding-top: 12mm; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: .35mm solid ${palette.line}; }
      .page-header h2 { margin-top: 2.5mm; font-family: Georgia, 'Times New Roman', serif; font-size: 22pt; line-height: 1; }
      .page-brand { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 15pt; color: ${palette.green}; letter-spacing: 1px; }
      .footer { position: absolute; left: 15mm; right: 15mm; bottom: 7mm; height: 6mm; display: flex; justify-content: space-between; align-items: flex-end; border-top: .3mm solid ${palette.line}; padding-top: 2.2mm; color: ${palette.muted}; font-size: 6.8pt; letter-spacing: .15px; }

      .cover-page { background: ${palette.paper}; }
      .cover-top { height: 80mm; background: ${palette.green}; color: white; text-align: center; padding-top: 23mm; }
      .cover-brand { font-family: Georgia, 'Times New Roman', serif; font-size: 35pt; font-weight: 700; letter-spacing: 1.5px; }
      .cover-tagline { margin-top: 7mm; font-size: 9pt; font-weight: 700; letter-spacing: 1.2px; }
      .cover-body { display: grid; grid-template-columns: 43% 57%; height: 151mm; }
      .cover-copy { padding: 25mm 8mm 0 18mm; }
      .cover-copy h1 { margin-top: 5mm; font-family: Georgia, 'Times New Roman', serif; font-size: 34pt; line-height: 1.02; letter-spacing: -1px; }
      .cover-copy p { margin-top: 13mm; color: ${palette.muted}; font-size: 11pt; line-height: 1.5; }
      .cover-meta { margin-top: 13mm; color: ${palette.green}; font-size: 8pt; font-weight: 800; letter-spacing: 1.1px; }
      .cover-gallery { position: relative; margin: 12mm 10mm 0 2mm; }
      .hero { position: absolute; overflow: hidden; border-radius: 3.5mm; box-shadow: 0 3mm 10mm rgba(23,20,15,.13); background: ${palette.soft}; }
      .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .hero-1 { left: 0; top: 0; width: 62mm; height: 72mm; z-index: 2; }
      .hero-2 { right: 0; top: 22mm; width: 52mm; height: 75mm; z-index: 3; }
      .hero-3 { left: 17mm; top: 80mm; width: 65mm; height: 55mm; z-index: 1; }
      .cover-contact { position: absolute; left: 18mm; right: 18mm; bottom: 13mm; height: 43mm; border-radius: 4mm; background: ${palette.soft}; display: flex; justify-content: space-between; align-items: center; padding: 7mm 8mm; }
      .cover-contact > div:first-child { display: flex; flex-direction: column; gap: 2.5mm; color: ${palette.muted}; font-size: 8.5pt; }
      .cover-contact strong { color: ${palette.ink}; font-size: 9.5pt; }
      .cover-qr { display: flex; flex-direction: column; align-items: center; gap: 1.2mm; color: ${palette.muted}; font-size: 6pt; }
      .cover-qr img { width: 25mm; height: 25mm; background: white; padding: 1mm; }

      .intro-page { padding-bottom: 18mm; }
      .intro-lead { margin: 11mm 15mm 0; width: 150mm; }
      .intro-lead p { font-family: Georgia, 'Times New Roman', serif; font-size: 20pt; line-height: 1.35; }
      .intro-columns { margin: 12mm 15mm 0; display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
      .intro-panel { background: ${palette.cream}; border: .3mm solid ${palette.line}; padding: 6mm; min-height: 34mm; }
      .intro-panel h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: .6px; color: ${palette.green}; }
      .intro-panel p { margin-top: 3mm; font-size: 9pt; line-height: 1.45; }
      .collection-list { margin: 10mm 15mm 0; border-top: .35mm solid ${palette.line}; }
      .collection-row { height: 11mm; display: grid; grid-template-columns: 12mm 1fr 30mm; align-items: center; border-bottom: .3mm solid ${palette.line}; }
      .collection-row span { color: ${palette.gold}; font-size: 8pt; font-weight: 800; }
      .collection-row strong { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; }
      .collection-row em { justify-self: end; font-size: 7.5pt; color: ${palette.muted}; font-style: normal; }
      .ordering-note { margin: 9mm 15mm 0; background: ${palette.green}; color: white; padding: 6mm 7mm; border-radius: 2mm; }
      .ordering-note strong { text-transform: uppercase; font-size: 8pt; letter-spacing: .7px; }
      .ordering-note p { margin-top: 2.5mm; font-size: 8.2pt; line-height: 1.5; opacity: .94; }

      .catalogue-page { padding-bottom: 18mm; }
      .product-grid { height: 243mm; margin: 7mm 15mm 0; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 6mm; }
      .product-card { min-height: 0; border: .3mm solid ${palette.line}; border-radius: 3mm; overflow: hidden; background: white; display: grid; grid-template-rows: 84mm 1fr; box-shadow: 0 1.5mm 5mm rgba(23,20,15,.045); }
      .product-image-wrap { position: relative; overflow: hidden; background: ${palette.cream}; }
      .product-image { position: relative; z-index: 2; width: 100%; height: 100%; object-fit: cover; display: block; }
      .image-fallback { position: absolute; inset: 0; display: grid; place-items: center; color: ${palette.gold}; font-family: Georgia, 'Times New Roman', serif; font-size: 18pt; z-index: 1; }
      .product-copy { padding: 5mm 5.2mm 4.5mm; display: flex; flex-direction: column; min-height: 0; }
      .product-type { color: ${palette.gold}; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .9px; font-weight: 800; height: 4mm; overflow: hidden; }
      .product-copy h3 { margin-top: 2.4mm; font-family: Georgia, 'Times New Roman', serif; font-size: 13.5pt; line-height: 1.16; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .product-bottom { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; border-top: .3mm solid ${palette.line}; padding-top: 3.2mm; gap: 3mm; }
      .price { color: ${palette.green}; font-size: 11pt; font-weight: 800; }
      .small-batch { color: ${palette.muted}; font-size: 5.8pt; letter-spacing: .65px; white-space: nowrap; }

      .enquiry-page { padding-bottom: 18mm; }
      .enquiry-lead { margin: 10mm 15mm 0; color: ${palette.muted}; font-size: 10pt; line-height: 1.5; width: 160mm; }
      .enquiry-table { border-collapse: collapse; width: 180mm; margin: 10mm 15mm 0; table-layout: fixed; }
      .enquiry-table th, .enquiry-table td { border: .3mm solid ${palette.line}; }
      .enquiry-table th { height: 11mm; padding: 0 3mm; text-align: left; background: ${palette.green}; color: white; font-size: 7pt; text-transform: uppercase; letter-spacing: .4px; }
      .enquiry-table th:nth-child(1) { width: 67mm; }
      .enquiry-table th:nth-child(2) { width: 18mm; }
      .enquiry-table th:nth-child(3) { width: 48mm; }
      .enquiry-table td { height: 12mm; background: white; }
      .closing-card { margin: 10mm 15mm 0; background: ${palette.soft}; border-radius: 3mm; padding: 7mm; display: flex; justify-content: space-between; align-items: center; }
      .closing-card h3 { margin-top: 2.5mm; font-family: Georgia, 'Times New Roman', serif; font-size: 20pt; }
      .closing-card p { margin-top: 3mm; color: ${palette.muted}; font-size: 8.5pt; line-height: 1.6; }
      .closing-qr { display: flex; flex-direction: column; align-items: center; gap: 2mm; font-size: 6pt; color: ${palette.muted}; letter-spacing: .4px; }
      .closing-qr img { width: 29mm; height: 29mm; background: white; padding: 1.2mm; }
    </style>
  </head>
  <body>${pages.join('\n')}</body>
  </html>`;
}

async function main() {
  const products = await fetchProducts();
  if (!products.length) throw new Error('No published Sahara products were returned.');
  console.log(`Building catalogue with ${products.length} live products.`);

  const html = await buildHtml(products);
  fs.writeFileSync(path.join(__dirname, 'catalogue-preview.html'), html, 'utf8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 180000 });
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(images.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', () => {
            image.style.display = 'none';
            resolve();
          }, { once: true });
        });
      }));
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await page.pdf({
      path: OUTPUT,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false,
    });
  } finally {
    await browser.close();
  }

  const stat = fs.statSync(OUTPUT);
  console.log(`Created ${OUTPUT} (${Math.round(stat.size / 1024 / 1024 * 10) / 10} MB).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
