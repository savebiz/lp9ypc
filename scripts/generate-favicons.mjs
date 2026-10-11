/**
 * generate-favicons.mjs
 * Composites the official LP9 YPC logo (transparent background)
 * onto square backgrounds for all favicon targets.
 *
 * Output:
 *   src/app/favicon.ico    — multi-size ICO (16/32/48px, navy #0B2545)
 *   src/app/icon.png       — 512px PNG (navy #0B2545) → modern browser tab
 *   src/app/apple-icon.png — 512px PNG (white #FFFFFF) → iPhone/iPad home screen
 *
 * Run: node scripts/generate-favicons.mjs
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.resolve(__dirname, "..");
const SOURCE    = path.join(root, "public", "branding", "LP9_YAYA_1-removebg-preview.png");

/** Composite SOURCE onto a solid-colour square canvas at the given pixel size. */
async function compositeAt(px, bgHex) {
  const pad    = Math.round(px * 0.10);
  const logoSz = px - pad * 2;
  const r      = parseInt(bgHex.slice(1, 3), 16);
  const g      = parseInt(bgHex.slice(3, 5), 16);
  const b      = parseInt(bgHex.slice(5, 7), 16);

  const resized = await sharp(SOURCE)
    .resize(logoSz, logoSz, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: { width: px, height: px, channels: 4, background: { r, g, b, alpha: 255 } },
  })
    .composite([{ input: resized, top: pad, left: pad }])
    .png()
    .toBuffer();
}

/**
 * Build a minimal valid multi-resolution ICO from an array of PNG buffers.
 * Each PNG is embedded verbatim inside the ICO container.
 */
function buildIco(pngBuffers) {
  const count = pngBuffers.length;

  // ICO file header: 6 bytes
  const fileHeader = Buffer.alloc(6);
  fileHeader.writeUInt16LE(0, 0); // reserved
  fileHeader.writeUInt16LE(1, 2); // type: 1 = ICO
  fileHeader.writeUInt16LE(count, 4);

  // Directory entries: 16 bytes each
  let offset = 6 + count * 16;
  const dirEntries = pngBuffers.map((buf) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(0,   0); // width  — 0 means "use PNG header"
    entry.writeUInt8(0,   1); // height — 0 means "use PNG header"
    entry.writeUInt8(0,   2); // colour count (0 = not a palette image)
    entry.writeUInt8(0,   3); // reserved
    entry.writeUInt16LE(1,  4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buf.length, 8);  // size of image data
    entry.writeUInt32LE(offset,     12); // offset to image data
    offset += buf.length;
    return entry;
  });

  return Buffer.concat([fileHeader, ...dirEntries, ...pngBuffers]);
}

async function main() {
  console.log("🖼️  Generating favicons from official LP9 YPC logo...\n");

  // ── favicon.ico: 16, 32, 48 px on navy ────────────────────────────────
  const [px16, px32, px48] = await Promise.all([
    compositeAt(16, "#0B2545"),
    compositeAt(32, "#0B2545"),
    compositeAt(48, "#0B2545"),
  ]);
  const icoPath = path.join(root, "src", "app", "favicon.ico");
  fs.writeFileSync(icoPath, buildIco([px16, px32, px48]));
  console.log(`✅  favicon.ico  (16+32+48px, navy)  →  ${path.relative(root, icoPath)}`);

  // ── icon.png: 512 px on navy ───────────────────────────────────────────
  const iconPath = path.join(root, "src", "app", "icon.png");
  fs.writeFileSync(iconPath, await compositeAt(512, "#0B2545"));
  console.log(`✅  icon.png     (512px, navy)        →  ${path.relative(root, iconPath)}`);

  // ── apple-icon.png: 512 px on white ───────────────────────────────────
  const applePath = path.join(root, "src", "app", "apple-icon.png");
  fs.writeFileSync(applePath, await compositeAt(512, "#FFFFFF"));
  console.log(`✅  apple-icon.png (512px, white)     →  ${path.relative(root, applePath)}`);

  console.log("\n🎉  Done. All favicon files updated in src/app/");
}

main().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
