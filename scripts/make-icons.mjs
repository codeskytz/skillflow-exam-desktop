/**
 * Build the platform icon into every format the installers need.
 *
 * Electron Forge ships a generic Electron logo unless it is given one, which is
 * what a student saw on the installer, the desktop shortcut and the taskbar.
 * Packager picks the file by extension per platform, so all three are produced
 * from the one 512px source in assets/icon-source.png.
 *
 * Run after changing the logo:   npm run icons
 * The output is committed, so a normal build needs none of this.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from 'jimp';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'assets');
const SOURCE = path.join(assets, 'icon-source.png');

/**
 * Windows reads the small sizes for the taskbar and the file list, and the
 * large ones for the desktop and the installer banner.
 */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * macOS chunk types, keyed by the pixel size each one must contain.
 * ic07–ic10 are the modern PNG-based entries.
 */
const ICNS_TYPES = { 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };

/** Sizes the Linux packages and the renderer use directly. */
const PNG_SIZES = [512, 256, 64];

async function resized(image, size) {
  return image.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
}

/**
 * A 32-bit bottom-up DIB, which is what an .ico entry holds for the small
 * sizes. Windows renders PNG-compressed entries too, but only reliably at 256;
 * below that some shell surfaces still expect the bitmap, and a wrong guess
 * shows up as a black square rather than an error.
 */
function bmpEntry(bitmap) {
  const { width: w, height: h, data } = bitmap;

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  header.writeInt32LE(h * 2, 8); // colour data plus the mask, per the ICO spec
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);

  // BGRA, bottom-up.
  const pixels = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = ((h - 1 - y) * w + x) * 4;
      pixels[dst] = data[src + 2];
      pixels[dst + 1] = data[src + 1];
      pixels[dst + 2] = data[src];
      pixels[dst + 3] = data[src + 3];
    }
  }

  // The AND mask is unused with an alpha channel but must still be present,
  // padded to a 4-byte boundary per row.
  const maskRow = Math.ceil(w / 32) * 4;
  const mask = Buffer.alloc(maskRow * h, 0);

  return Buffer.concat([header, pixels, mask]);
}

async function buildIco(image) {
  const entries = [];

  for (const size of ICO_SIZES) {
    const img = await resized(image, size);
    // 256 goes in as PNG: a bitmap that large bloats the file for no gain.
    const data = size === 256 ? await img.getBufferAsync(Jimp.MIME_PNG) : bmpEntry(img.bitmap);
    entries.push({ size, data });
  }

  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // 1 = icon
  dir.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const table = [];

  for (const entry of entries) {
    const row = Buffer.alloc(16);
    row.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0); // 0 means 256
    row.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1);
    row.writeUInt8(0, 2);
    row.writeUInt8(0, 3);
    row.writeUInt16LE(1, 4);
    row.writeUInt16LE(32, 6);
    row.writeUInt32LE(entry.data.length, 8);
    row.writeUInt32LE(offset, 12);
    table.push(row);
    offset += entry.data.length;
  }

  return Buffer.concat([dir, ...table, ...entries.map((e) => e.data)]);
}

async function buildIcns(image) {
  const chunks = [];

  for (const [size, type] of Object.entries(ICNS_TYPES)) {
    const png = await (await resized(image, Number(size))).getBufferAsync(Jimp.MIME_PNG);
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(png.length + 8, 4); // length includes this header
    chunks.push(header, png);
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);

  return Buffer.concat([header, body]);
}

const source = await Jimp.read(SOURCE);

if (source.bitmap.width !== source.bitmap.height) {
  throw new Error(`icon-source.png must be square; it is ${source.bitmap.width}x${source.bitmap.height}`);
}

// The largest macOS entry is 1024. Upscaling a 512 source is better than
// omitting the chunk, but say so rather than doing it silently.
if (source.bitmap.width < 1024) {
  console.warn(`note: source is ${source.bitmap.width}px, so the 1024px macOS entry is upscaled`);
}

const written = [];

const ico = await buildIco(source);
fs.writeFileSync(path.join(assets, 'icon.ico'), ico);
written.push(['icon.ico', ico.length, `${ICO_SIZES.length} sizes: ${ICO_SIZES.join(', ')}`]);

const icns = await buildIcns(source);
fs.writeFileSync(path.join(assets, 'icon.icns'), icns);
written.push(['icon.icns', icns.length, Object.values(ICNS_TYPES).join(', ')]);

for (const size of PNG_SIZES) {
  const png = await (await resized(source, size)).getBufferAsync(Jimp.MIME_PNG);
  const name = size === 512 ? 'icon.png' : `icon-${size}.png`;
  fs.writeFileSync(path.join(assets, name), png);
  written.push([name, png.length, `${size}x${size}`]);
}

for (const [name, bytes, note] of written) {
  console.log(`  ${name.padEnd(14)} ${String((bytes / 1024).toFixed(1)).padStart(7)} KB   ${note}`);
}
