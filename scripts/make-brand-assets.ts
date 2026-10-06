/**
 * Generates favicon PNGs, app icons and the 1200x630 social share image
 * (src/public/og-image.jpg) from champion portraits of the newest set.
 *
 *   npm run brand:assets
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PUBLIC_DIR, SITE_CONFIG, latestSetNumber, readJson, setDir } from "./lib/paths.ts";
import type { SetData } from "./lib/set-types.ts";

const COLORS = ["#1fb487", "#3a8be6", "#b552da", "#f2b53b"];
const BG = "#0a0f1e";
const site = readJson<{ name: string; tagline: string }>(SITE_CONFIG);
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function markSvg(size: number, padding = 0, background?: string): string {
  const inner = 32 - padding * 2;
  const scale = inner / 32;
  const rects = [
    [2, 2],
    [17, 2],
    [2, 17],
    [17, 17],
  ]
    .map(([x, y], i) => `<rect x="${x}" y="${y}" width="13" height="13" rx="3" fill="${COLORS[i]}"/>`)
    .join("");
  const bg = background ? `<rect width="32" height="32" rx="${padding ? 0 : 6}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${bg}<g transform="translate(${padding} ${padding}) scale(${scale})">${rects}</g></svg>`;
}

async function png(svg: string, out: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(path.join(PUBLIC_DIR, out));
  console.log(`  ${out}`);
}

async function main(): Promise<void> {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.svg"), markSvg(32));
  console.log("  favicon.svg");
  await png(markSvg(32), "favicon-32.png");
  await png(markSvg(180, 4, BG), "apple-touch-icon.png");
  await png(markSvg(192, 3, BG), "icon-192.png");
  await png(markSvg(512, 3, BG), "icon-512.png");
  await png(markSvg(512, 7, BG), "icon-maskable-512.png");

  // Social image: wordmark on the left, a 4x4 board of champions on the right.
  const set = readJson<SetData>(path.join(setDir(latestSetNumber()), "set.json"));
  const step = Math.max(1, Math.floor(set.champions.length / 16));
  const picks = set.champions.filter((_, i) => i % step === 0).slice(0, 16);
  const tile = 118;
  const gap = 12;
  const boardX = 1200 - 48 - (tile * 4 + gap * 3);
  const boardY = (630 - (tile * 4 + gap * 3)) / 2;
  const composites: sharp.OverlayOptions[] = [];
  for (let i = 0; i < picks.length; i++) {
    const file = path.join(PUBLIC_DIR, picks[i].img);
    const mask = Buffer.from(`<svg width="${tile}" height="${tile}"><rect width="${tile}" height="${tile}" rx="14" fill="#fff"/></svg>`);
    const img = await sharp(file)
      .resize(tile, tile, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    composites.push({ input: img, left: boardX + (i % 4) * (tile + gap), top: Math.round(boardY + Math.floor(i / 4) * (tile + gap)) });
  }
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
      <radialGradient id="glow" cx="30%" cy="10%" r="80%"><stop offset="0" stop-color="#1d3f7a" stop-opacity=".55"/><stop offset="1" stop-color="${BG}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1200" height="630" fill="${BG}"/>
    <rect width="1200" height="630" fill="url(#glow)"/>
    <g transform="translate(64 150) scale(3.2)">${markSvg(32).replace(/<\/?svg[^>]*>/g, "")}</g>
    <text x="64" y="320" font-family="Georgia, 'Times New Roman', serif" font-size="78" font-weight="700" letter-spacing="3" fill="#f3d27e">${xml(site.name.toUpperCase())}</text>
    <text x="66" y="384" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#eef2fb">${xml(site.tagline)}</text>
    <text x="66" y="440" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="#a9b4d0">Set ${set.set}: ${xml(set.name)}</text>
  </svg>`;
  await sharp(Buffer.from(overlay)).composite(composites).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(PUBLIC_DIR, "og-image.jpg"));
  console.log("  og-image.jpg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
