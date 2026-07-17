/**
 * Gera os PNGs de ícone a partir dos SVGs de logo.
 * Rode após alterar public/logo.svg ou public/logo-maskable.svg:
 *   pnpm gen-icons
 * Os PNGs gerados são commitados no repositório.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logo = readFileSync(resolve(root, "public/logo.svg"));
const maskable = readFileSync(resolve(root, "public/logo-maskable.svg"));

const targets = [
  { src: logo, size: 192, out: "public/icons/icon-192.png" },
  { src: logo, size: 512, out: "public/icons/icon-512.png" },
  { src: maskable, size: 512, out: "public/icons/icon-maskable-512.png" },
  { src: logo, size: 180, out: "src/app/apple-icon.png" },
];

for (const { src, size, out } of targets) {
  await sharp(src, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(resolve(root, out));
  console.log(`✓ ${out} (${size}×${size})`);
}
