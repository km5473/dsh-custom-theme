// Prove that a RUNNING DSH host serves a freshly deployed plugin bundle.
//
// The bundle route is revision-guarded (`?rev=` is an sha1 over the artifact's
// mtime, ctime and size), so a stale deployment cannot be mistaken for a fresh
// one: this script recomputes the same revision and compares the bytes the host
// returns with the bytes on disk.
//
// Usage: node scripts/verify-served-bundle.mjs <installed lib/client.js> [origin] [entry-id]
import { createHash } from 'node:crypto';
import { statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const target = process.argv[2];
const origin = new URL(process.argv[3] ?? 'http://127.0.0.1:3080').origin;
if (!target) { console.error('usage: node scripts/verify-served-bundle.mjs <installed lib/client.js> [origin] [entry-id]'); process.exit(2); }
// The entry id is the package name the Host knows the bundle by, which is not
// necessarily the one in the workspace: staging a build under a previous name
// keeps a running session themed across a rename.
const ID = process.argv[4] ?? JSON.parse(readFileSync(join(dirname(target), '..', 'package.json'), 'utf8')).name;

/** The host's own revision derivation (framed sha1, 12 hex chars). */
const framedHash = (domain, parts) => {
  const hash = createHash('sha1').update(domain).update('\0');
  for (const part of parts) hash.update(`${String(Buffer.byteLength(part))}:`).update(part);
  return hash.digest('hex').slice(0, 12);
};

const bundle = statSync(target);
const rev = framedHash('plugin-artifact', [String(bundle.mtimeMs), String(bundle.ctimeMs), String(bundle.size)]);
const local = readFileSync(target, 'utf8');
console.log(`on disk : ${bundle.size} bytes, rev ${rev}`);

const candidates = [
  ['chunk', `${origin}/plugins/${ID}/client.js?rev=${rev}`],
  ['combo', `${origin}/plugins/??${ID}/client.js&rev=${rev}`]
];

let served;
for (const [label, url] of candidates) {
  let status = 0;
  let text = '';
  try {
    const response = await fetch(url);
    status = response.status;
    text = Buffer.from(await response.arrayBuffer()).toString('utf8');
  } catch (error) { status = `ERR ${error.message}`; }
  // The host appends a source-map reference trailer to the executable bytes.
  const carries = text.startsWith(local.trimEnd()) && Buffer.byteLength(text) - Buffer.byteLength(local) < 400;
  console.log(`  ${String(status).padEnd(6)} ${String(Buffer.byteLength(text)).padEnd(9)} carries-deployed-bytes=${carries}  ${label}`);
  if (carries && !served) served = text;
}

if (!served) { console.error('FAIL: the live host does not serve the deployed bundle'); process.exit(1); }

const markers = ['customColors', 'createIndexedImageStore', 'parseImport', 'buildExport', 'resolvePalettes', 'lightName', 'stickerName', '辅助色1', '辅助色3', 'km5473', 'https://github.com/Mahiru0427/dsh-vesna-theme', '找我什么事呀，亲爱的朋友~'];
const features = [
  ['chat-panel blur switch', 'setPanelBlur'],
  ['Gaussian panel material', 'installGaussianMessageMarkers'],
  ['panel blur gated on the switch marker', 'data-dct-material'],
  ['advanced panel blur ring', 'data-dct-advblur'],
  ['panel material blur', 'backdrop-filter:blur(3px)'],
  ['info-bar capsule', '--dsw-alias-bg-module-platform'],
  ['renamed auxiliary color variables', "'--dct-support'"],
  ['legacy auxiliary key compatibility', "pink:'support1'"]
];
const missing = markers.filter(marker => !served.includes(marker));
if (missing.length > 0) { console.error(`FAIL: served bundle is missing ${missing.join(', ')}`); process.exit(1); }
const absent = features.filter(([, needle]) => !served.includes(needle)).map(([label]) => label);
if (absent.length > 0) { console.error(`FAIL: served bundle is missing ${absent.join(', ')}`); process.exit(1); }
// The blur-band experiments, the liquid-glass material, the old-name data
// migration and the blurred input card (hover flicker) were all removed: none of
// their markers may ship.
for (const gone of ['dct-fade', 'dct-scroll', 'installLiquidGlassOptics', 'liquidGlassCss', 'LEGACY_STORAGE_KEY', 'LEGACY_CUSTOM_KEY', 'LEGACY_IMAGE_DATABASE', 'LEGACY_FORMATS', '--dct-input-glass);background-image:none;border:1px solid var(--dsw-alias-border-l2);backdrop-filter:blur(']) {
  if (served.includes(gone)) { console.error(`FAIL: reverted code (${gone}) is still in the bundle`); process.exit(1); }
}
console.log('PASS: the live host serves the deployed bundle and every expected feature is present');
