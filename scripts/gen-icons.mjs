/**
 * public/icon-source.svg から各種サイズのPNGアイコンを生成する。
 *
 * 出力:
 *   public/icon-192.png           … PWA標準
 *   public/icon-512.png           … PWA標準(高解像度)
 *   public/icon-maskable-512.png  … Android用(安全領域を考慮した余白付き)
 *   public/apple-touch-icon.png   … iOS 180px
 *
 * 実行: `npm run icons`
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
const srcSvg = resolve(publicDir, "icon-source.svg");

async function writeSquare(name, size) {
  const out = resolve(publicDir, name);
  await sharp(srcSvg)
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${name} (${size}x${size})`);
}

/**
 * maskableアイコン: Androidは丸/角丸にマスクする時、外側20%を削る可能性がある。
 * SVG全体を内側80%に収める=周囲に10%ずつ余白を足してからリサイズ。
 */
async function writeMaskable(name, size) {
  const out = resolve(publicDir, name);
  const padded = size; // 出力サイズ
  const inner = Math.round(size * 0.8); // 中身サイズ

  // SVGをinnerにリサイズ → paddedのキャンバスに中央配置 (背景色で埋める)
  const svgBuf = await sharp(srcSvg)
    .resize(inner, inner, { fit: "contain" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: padded,
      height: padded,
      channels: 3,
      background: { r: 11, g: 11, b: 30 }, // SVGの背景色と合わせる
    },
  })
    .composite([{ input: svgBuf, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${name} (${size}x${size}, maskable safe-area)`);
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  console.log("🎆 アイコン生成中...");
  await writeSquare("icon-192.png", 192);
  await writeSquare("icon-512.png", 512);
  await writeMaskable("icon-maskable-512.png", 512);
  await writeSquare("apple-touch-icon.png", 180);
  console.log("✅ 完了");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
