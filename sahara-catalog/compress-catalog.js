const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

(async () => {
  const htmlPath = path.join(process.cwd(), 'catalogue-preview.html');
  const outputPath = path.join(process.cwd(), 'Sahara_Product_Catalogue_With_Photos.pdf');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1250, deviceScaleFactor: 1.35 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: 180000 });
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return image.decode?.().catch(() => undefined);
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }));
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const elements = await page.$$('.page');
    const pdf = await PDFDocument.create();
    pdf.setTitle('Sahara Product Catalogue');
    pdf.setAuthor('Sahara Shopping');
    pdf.setSubject('Current Sahara retail catalogue with product photography and prices in AED');
    const a4 = [595.28, 841.89];

    for (const element of elements) {
      const jpeg = await element.screenshot({ type: 'jpeg', quality: 70, captureBeyondViewport: true });
      const image = await pdf.embedJpg(jpeg);
      const pdfPage = pdf.addPage(a4);
      pdfPage.drawImage(image, { x: 0, y: 0, width: a4[0], height: a4[1] });
    }

    const bytes = await pdf.save({ useObjectStreams: true });
    fs.writeFileSync(outputPath, bytes);
    console.log(`Compressed catalogue: ${elements.length} pages, ${Math.round(bytes.length / 1024 / 1024 * 10) / 10} MB`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
