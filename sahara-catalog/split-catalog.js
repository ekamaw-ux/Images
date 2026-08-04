const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

(async () => {
  const sourcePath = path.join(process.cwd(), 'Sahara_Product_Catalogue_With_Photos.pdf');
  const sourceBytes = fs.readFileSync(sourcePath);
  const source = await PDFDocument.load(sourceBytes);
  const outputDir = path.join(process.cwd(), 'pages');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const pages = [];

  for (let index = 0; index < source.getPageCount(); index += 1) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(source, [index]);
    doc.addPage(page);
    const bytes = await doc.save({ useObjectStreams: true });
    const name = `page-${String(index + 1).padStart(3, '0')}.pdf`;
    fs.writeFileSync(path.join(outputDir, name), bytes);
    pages.push({ name, bytes: bytes.length });
  }

  fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({
    pageCount: pages.length,
    sourceBytes: sourceBytes.length,
    pages,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
