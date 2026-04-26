/**
 * One-off icon generator: rasterizes ghost-icon.svg into the PNG sizes
 * required by the WebExtension manifest (48 / 96 / 128).
 *
 * Run from the project root:
 *   npx --package=sharp@latest node extension/firefox/icons/generate.mjs
 *
 * Output is committed to extension/firefox/icons/icon-{48,96,128}.png.
 * Re-run only when ghost-icon.svg changes.
 */

import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, "ghost-icon.svg");
const svg = readFileSync(svgPath);

const sizes = [48, 96, 128];

for (const size of sizes) {
  const out = resolve(here, `icon-${size}.png`);
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${buf.length} bytes)`);
}
