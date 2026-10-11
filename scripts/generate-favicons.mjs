/**
 * generate-favicons.mjs
 * Composites the official LP9 YPC logo (with transparent background)
 * onto square backgrounds for browser favicon and Apple touch icon.
 *
 * Output:
 *   src/app/icon.png       — navy background  (#0B2545) → browser tab favicon
 *   src/app/apple-icon.png — white background (#FFFFFF) → iPhone/iPad home screen
 */

import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SOURCE = path.join(root, "public", "branding", "LP9_YAYA_1-removebg-preview.png");
const SIZE = 512;       // output canvas size in pixels
const PADDING = 51;     // 10% padding on each side (logo occupies 80% of canvas)

const logoSize = SIZE - PADDING * 2;

async function composite(bgColor, destPath, label) {
  // 1. Resize the source logo to fit within the padded area, preserving aspect ratio
  const resizedLogo = await sharp(SOURCE)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent letterbox
    })
    .toBuffer();

  // 2. Parse background color hex → RGBA
  const r = parseInt(bgColor.slice(1, 3), 16);
  const g = parseInt(bgColor.slice(3, 5), 16);
  const b = parseInt(bgColor.slice(5, 7), 16);

  // 3. Create flat square background and overlay logo centered
  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r, g, b, alpha: 255 },
    },
  })
    .composite([
      {
        input: resizedLogo,
        top: PADDING,
        left: PADDING,
      },
    ])
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(destPath);

  console.log(`✅  ${label} → ${path.relative(root, destPath)}`);
}

async function main() {
  console.log("🖼️  Generating favicons from official LP9 YPC logo...\n");

  await composite(
    "#0B2545",
    path.join(root, "src", "app", "icon.png"),
    "Browser favicon (navy #0B2545)"
  );

  await composite(
    "#FFFFFF",
    path.join(root, "src", "app", "apple-icon.png"),
    "Apple touch icon (white #FFFFFF)"
  );

  console.log("\n🎉  Done. Both icon files updated in src/app/");
}

main().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
