from pathlib import Path
import re

path = Path(__file__).with_name("render.js")
source = path.read_text(encoding="utf-8")

replacement = r'''function productPrice(product) {
  const values = (product.variants || [])
    .map((variant) => Number.parseFloat(variant.price))
    .filter((price) => Number.isFinite(price));
  if (!values.length) return 'Price on request';

  const titleOverrides = new Map([
    ['Azure Muse Coaster Set', 125],
    ['The Savannah Treasure Pot', 145],
    ['Hand-Beaded Keepsake Pot — Bronze Story', 145],
    ['Hand-Beaded Keepsake Pot - Bronze Story', 145],
  ]);

  const storefrontAdjustments = new Map([
    [300, 299], [250, 249], [240, 239], [230, 229], [200, 199],
    [180, 179], [160, 159], [150, 149], [130, 129], [120, 119],
    [100, 99], [90, 89], [80, 79], [70, 69], [60, 59],
    [50, 49], [40, 39],
  ]);

  const adjust = (value) => {
    if (titleOverrides.has(product.title)) return titleOverrides.get(product.title);
    return storefrontAdjustments.has(value) ? storefrontAdjustments.get(value) : value;
  };

  const min = adjust(Math.min(...values));
  const max = adjust(Math.max(...values));
  const format = (value) => new Intl.NumberFormat('en-AE', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
  return min === max ? `AED ${format(min)}` : `From AED ${format(min)}`;
}'''

pattern = r"function productPrice\(product\) \{.*?\n\}\n\nfunction chunks"
updated, count = re.subn(pattern, replacement + "\n\nfunction chunks", source, count=1, flags=re.S)
if count != 1:
    raise SystemExit("Could not replace productPrice function")
path.write_text(updated, encoding="utf-8")
print("Patched renderer with Sahara storefront price rules.")
