// Portable configuration document: the customization half of the plugin
// (colors, card copy, custom names, wallpaper and sticker images) in one JSON
// file. Pure data — no DOM, no storage — so both the settings card and the
// tests share exactly one validator.
import { PALETTE_KEYS, isColor, paletteKey } from './palette.js';

/** Marker that identifies a dsh-custom-theme configuration file. */
export const CONFIG_FORMAT = 'dsh-custom-theme';
/** Earlier markers still accepted on import so files exported before the
 * plugin was renamed keep working. */
export const LEGACY_FORMATS = Object.freeze(['dsh-vesna-theme']);
/** Document revision. A newer document is refused rather than half-read.
 * New fields are additive, so an older file imports with empty names. */
export const CONFIG_VERSION = 1;
/** Characters kept for each free-text copy field; longer input is truncated. */
export const TEXT_LIMITS = Object.freeze({ title: 60, description: 200, greeting: 120 });
/** Characters kept for a user-given appearance or sticker name. */
export const NAME_LIMIT = 20;
/** The two appearance modes whose names the user may change. */
export const MODE_KEYS = Object.freeze(['light', 'dark']);
/** Largest accepted upload before processing, per slot kind. */
export const UPLOAD_LIMITS = Object.freeze({ wallpaper: 32 * 1024 * 1024, sticker: 12 * 1024 * 1024 });
/** Largest image that may be persisted or embedded in an exported file. */
export const IMAGE_LIMITS = Object.freeze({ wallpaper: 8 * 1024 * 1024, sticker: 2 * 1024 * 1024 });
/** Sticker slots in display order; index is the artwork slot used by art.js. */
export const STICKER_SLOTS = 6;
/** Base64 payload accepted for an embedded image. */
const IMAGE_PATTERN = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Collapse a free-text field to one trimmed line within its limit.
 * @param value - raw user input.
 * @param limit - maximum number of characters kept.
 * @returns the sanitized string, or '' when nothing usable was given.
 */
export function sanitizeText(value, limit) {
  if (typeof value !== 'string') return '';
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > limit ? collapsed.slice(0, limit).trim() : collapsed;
}

/** Sanitize the per-sticker names into a fixed-length list.
 * @param value - candidate array of names.
 * @returns an array of {@link STICKER_SLOTS} strings.
 */
export function sanitizeStickerNames(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: STICKER_SLOTS }, (_, index) => sanitizeText(source[index], NAME_LIMIT));
}

/** Sanitize the appearance names; an empty string means "use the built-in".
 * @param value - candidate `{ light, dark }` name map.
 * @returns a fresh `{ light, dark }` pair.
 */
export function sanitizeModeNames(value) {
  const out = {};
  for (const mode of MODE_KEYS) out[mode] = sanitizeText(value && typeof value === 'object' ? value[mode] : '', NAME_LIMIT);
  return out;
}

/** Keep only known palette entries holding a valid color. Historical auxiliary
 * key names (`pink` / `gold` / `lilac`) are folded onto `support1..3`, so a file
 * or record exported before the rename still restores the same colors.
 * @param value - candidate `{ light, dark }` override maps.
 * @returns a fresh `{ light: {...}, dark: {...} }` with sanitized values.
 */
export function sanitizePalette(value) {
  const out = { light: {}, dark: {} };
  if (!value || typeof value !== 'object') return out;
  for (const mode of MODE_KEYS) {
    const source = value[mode];
    if (!source || typeof source !== 'object') continue;
    for (const [raw, color] of Object.entries(source)) {
      const key = paletteKey(raw);
      if (key && isColor(color)) out[mode][key] = color.trim().toLowerCase();
    }
  }
  return out;
}

/** Approximate decoded byte length of a base64 data URL. */
function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const payload = comma === -1 ? '' : dataUrl.slice(comma + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
}

/** Whether an embedded image is an accepted data URL within its size budget.
 * @param value - candidate data URL.
 * @param limit - maximum decoded bytes.
 * @returns true when the value can be imported.
 */
export function isEmbeddedImage(value, limit) {
  return typeof value === 'string' && IMAGE_PATTERN.test(value) && dataUrlBytes(value) <= limit;
}

/** Assemble the exported document. Images are embedded as data URLs so one
 * file carries the whole look; only customizations are written, never the
 * enable toggles or the native light/dark preference.
 * @param state - `{ palette, title, description, greeting, modeNames, stickerNames, images }`.
 * @returns a JSON-safe configuration document.
 */
export function buildExport(state) {
  const images = state.images || {};
  const stickers = Array.isArray(images.stickers) ? images.stickers : [];
  const document = {
    format: CONFIG_FORMAT,
    version: CONFIG_VERSION,
    palette: sanitizePalette(state.palette),
    title: sanitizeText(state.title, TEXT_LIMITS.title),
    description: sanitizeText(state.description, TEXT_LIMITS.description),
    greeting: sanitizeText(state.greeting, TEXT_LIMITS.greeting),
    modeNames: sanitizeModeNames(state.modeNames),
    stickerNames: sanitizeStickerNames(state.stickerNames),
    images: {
      wallpaper: typeof images.wallpaper === 'string' ? images.wallpaper : null,
      stickers: Array.from({ length: STICKER_SLOTS }, (_, index) => typeof stickers[index] === 'string' ? stickers[index] : null)
    }
  };
  return document;
}

/** Parse and fully validate an imported configuration file.
 * @param text - the file's text content.
 * @returns `{ ok: true, config }` or `{ ok: false, reason }` where reason is a
 * locale key the settings card can display.
 */
export function parseImport(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'importInvalid' };
  let data;
  try { data = JSON.parse(text); }
  catch { return { ok: false, reason: 'importInvalid' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'importInvalid' };
  if (data.format !== CONFIG_FORMAT && !LEGACY_FORMATS.includes(data.format)) return { ok: false, reason: 'importInvalid' };
  if (data.version !== CONFIG_VERSION) return { ok: false, reason: 'importVersion' };

  const palette = sanitizePalette(data.palette);
  // A palette holding keys we rejected means the file is not what it claims.
  if (data.palette && typeof data.palette === 'object') {
    for (const mode of MODE_KEYS) {
      const source = data.palette[mode];
      if (!source || typeof source !== 'object') continue;
      for (const key of Object.keys(source)) {
        if (paletteKey(key) && !isColor(source[key])) return { ok: false, reason: 'importInvalid' };
      }
    }
  }

  const images = data.images && typeof data.images === 'object' ? data.images : {};
  const stickerSource = Array.isArray(images.stickers) ? images.stickers : [];
  const wallpaper = images.wallpaper ?? null;
  if (wallpaper !== null && !isEmbeddedImage(wallpaper, IMAGE_LIMITS.wallpaper)) return { ok: false, reason: 'importImageInvalid' };
  const stickers = Array.from({ length: STICKER_SLOTS }, (_, index) => stickerSource[index] ?? null);
  for (const value of stickers) if (value !== null && !isEmbeddedImage(value, IMAGE_LIMITS.sticker)) return { ok: false, reason: 'importImageInvalid' };

  return { ok: true, config: {
    palette,
    title: sanitizeText(data.title, TEXT_LIMITS.title),
    description: sanitizeText(data.description, TEXT_LIMITS.description),
    greeting: sanitizeText(data.greeting, TEXT_LIMITS.greeting),
    modeNames: sanitizeModeNames(data.modeNames),
    stickerNames: sanitizeStickerNames(data.stickerNames),
    images: { wallpaper, stickers }
  } };
}
