/**
 * Check that a production bundle is actually a production bundle.
 *
 * Two faults shipped from this project without anything noticing, because both
 * build perfectly and only fail once installed:
 *
 *   1. `require('electron-squirrel-startup')` survived into main.js as an
 *      external. Forge's Vite build ships no node_modules, so the installed app
 *      died with "Cannot find module" before a window appeared.
 *
 *   2. Vite replaced MAIN_WINDOW_VITE_DEV_SERVER_URL with the dev server's
 *      address. A truthy literal made the file-loading branch dead code, so
 *      Rollup dropped it and the installed app could only load
 *      http://localhost:5173 — showing whichever Vite project was running, and
 *      a blank window when none was.
 *
 * Neither is visible in `npm run make` output. Both are trivially visible here.
 *
 * Run after `npm run package`, from the project root.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

let failures = 0;

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
  if (!ok) failures++;
}

function read(relative) {
  const full = path.join(root, relative);

  return fs.existsSync(full) ? fs.readFileSync(full) : null;
}

// ------------------------------------------------------------------ main process
console.log('\nmain process');

const mainJs = read('.vite/build/main.js');

check('.vite/build/main.js was produced', mainJs !== null);

if (mainJs) {
  const source = mainJs.toString('utf8');

  // Bug 2. The packaged app must be able to load its own renderer.
  check('loads the bundled renderer (loadFile present)', source.includes('loadFile'));

  /*
   * Specifically: the window must not be pointed at a dev server. A bare
   * localhost string is not enough to fail on — the API base legitimately
   * carries one for the `isDev` branch — so this looks for a local address
   * being handed to loadURL, which is the actual fault.
   */
  const devLoad = source.match(/loadURL\(\s*["'`]https?:\/\/(?:localhost|127\.0\.0\.1)[^"'`]*/);
  check('the window is not pointed at a dev server', devLoad === null, devLoad ? devLoad[0] : '');

  // The production API branch must survive too: the same dead-code elimination
  // that removed loadFile would remove this if `isDev` ever became a constant.
  check('the production API host survived the build', source.includes('api.skillflowtz.com'));

  // Bug 1. Anything still required by name has to exist at runtime, and the
  // asar carries no node_modules — so only Electron itself and Node built-ins
  // are legitimate.
  const required = [...source.matchAll(/require\((?:"([^"]+)"|'([^']+)')\)/g)].map((m) => m[1] ?? m[2]);
  const unresolvable = [...new Set(required)].filter((name) => name !== 'electron' && !name.startsWith('node:'));

  check(
    'every require() resolves at runtime',
    unresolvable.length === 0,
    unresolvable.length ? `unbundled: ${unresolvable.join(', ')}` : `${required.length} checked`,
  );
}

// --------------------------------------------------------------------- renderer
console.log('\nrenderer');

const indexHtml = read('.vite/renderer/main_window/index.html');

check('renderer index.html was produced', indexHtml !== null);

if (indexHtml) {
  const html = indexHtml.toString('utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const absolute = refs.filter((ref) => ref.startsWith('/'));

  // Under file:// a leading slash resolves to the filesystem root, so an
  // absolute asset path is another way to get a blank window.
  check(
    'asset paths are relative, so they resolve under file://',
    absolute.length === 0,
    absolute.length ? `absolute: ${absolute.join(', ')}` : refs.join(' '),
  );

  check('renderer has a script bundle', refs.some((ref) => ref.endsWith('.js')));
}

// ------------------------------------------------------------------------ icons
console.log('\nicons');

const ico = read('assets/icon.ico');
const icns = read('assets/icon.icns');
const png = read('assets/icon.png');

// A missing icon is not an error to Forge — it silently ships the stock
// Electron logo, which is exactly the sort of thing nobody notices until users
// have it installed.
check('assets/icon.ico exists', ico !== null);
check('assets/icon.icns exists', icns !== null);
check('assets/icon.png exists', png !== null);

if (ico) {
  const reserved = ico.readUInt16LE(0);
  const type = ico.readUInt16LE(2);
  const count = ico.readUInt16LE(4);

  check('icon.ico is a well-formed icon directory', reserved === 0 && type === 1 && count > 0, `${count} sizes`);

  let inBounds = true;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    if (offset + length > ico.length) inBounds = false;
  }
  check('every icon.ico entry lies inside the file', inBounds);
}

if (icns) {
  check('icon.icns has the right magic and length', icns.subarray(0, 4).toString() === 'icns' && icns.readUInt32BE(4) === icns.length);
}

// ----------------------------------------------------------------------- verdict
console.log(`\n${failures === 0 ? 'bundle looks like a production build' : `${failures} check(s) failed`}\n`);

process.exit(failures === 0 ? 0 : 1);
