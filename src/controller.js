import { resolvePalettes, buildTokenOverrides, buildArtOverrides, paletteKey } from './palette.js';
import { sanitizePalette, sanitizeText, sanitizeStickerNames, sanitizeModeNames, TEXT_LIMITS, NAME_LIMIT, MODE_KEYS, STICKER_SLOTS } from './config.js';
import { imageKey } from './image-store.js';

/** Persisted theme toggles and native scheme preference. */
export const STORAGE_KEY = 'dsh-custom-theme.preference.v1';
/** Persisted customization record: colors, copy and names. Image bytes live in
 * IndexedDB, keyed separately, because localStorage cannot hold them. */
export const CUSTOM_KEY = 'dsh-custom-theme.custom.v1';
/** Owner id of the ThemeRuntime override layer. */
export const SOURCE_ID = 'dsh-custom-theme';
/** Chat-panel effect switch: `true` paints the message panels with the static
 * Gaussian blur, `false` leaves the host's native surface. Replaces the earlier
 * two-way "liquid glass / Gaussian" picker — liquid glass was dropped. */
export const DEFAULT_PANEL_BLUR = true;
/** Advanced blur switch: a wider Gaussian halo wrapped around the input card's
 * edge, on top of the panel switch. */
export const DEFAULT_ADVANCED_BLUR = true;

const EMPTY_IMAGES = () => ({ wallpaper: null, stickers: Array.from({ length: STICKER_SLOTS }, () => null) });
const EMPTY_COLORS = () => ({ light: {}, dark: {} });
const EMPTY_MODE_NAMES = () => ({ light: '', dark: '' });
const EMPTY_STICKER_NAMES = () => Array.from({ length: STICKER_SLOTS }, () => '');

/** Read the panel-blur switch out of a persisted record. Records written before
 * the picker was replaced carry `material`; both of its values meant "an effect
 * was on", so they fold onto the switch. */
function readPanelBlur(data) {
  if (typeof data?.panelBlur === 'boolean') return data.panelBlur;
  if (data?.material === 'liquid' || data?.material === 'gaussian') return true;
  return DEFAULT_PANEL_BLUR;
}

/** Theme state owner: preference, customization, image bytes and the token layer.
 *
 * Everything the settings card renders comes from one immutable snapshot, so
 * React's `useSyncExternalStore` contract is satisfied without DOM reads. Small
 * values persist synchronously to localStorage; image bytes persist
 * asynchronously to the injected store and republish once loaded.
 *
 * @param theme - the ThemeRuntime service (`getTheme`, `setTheme`, `overrideTokens`).
 * @param storage - a localStorage-shaped object, or null when the browser blocks it.
 * @param options - `{ imageStore }`; a store with `load/write/remove/clear`.
 * @returns the controller surface consumed by the plugin body.
 */
export function createController(theme, storage, options = {}) {
  const imageStore = options.imageStore ?? null;
  const listeners = new Set();
  let disposed = false;
  let release;
  let snapshot;
  let enabled = true;
  let wallpaper = true;
  let stickers = true;
  let panelBlur = DEFAULT_PANEL_BLUR;
  let advancedBlur = DEFAULT_ADVANCED_BLUR;
  let storageState = 'saved';
  let readOnly = false;
  let colors = EMPTY_COLORS();
  let palette = resolvePalettes(colors);
  let title = '';
  let description = '';
  let greeting = '';
  let modeNames = EMPTY_MODE_NAMES();
  let stickerNames = EMPTY_STICKER_NAMES();
  let images = EMPTY_IMAGES();
  let imageState = imageStore ? 'loading' : 'unavailable';
  let notice = '';

  /** Read a persisted record, or null when the storage layer is unavailable. */
  function readRaw(key) {
    try { return storage.getItem(key); }
    catch { storageState = 'unavailable'; return null; }
  }

  function readPreference() {
    if (!storage) { storageState = 'unavailable'; return; }
    const raw = readRaw(STORAGE_KEY);
    if (raw === null) return;
    let data;
    try { data = JSON.parse(raw); }
    catch { storageState = 'invalid'; enabled = false; return; }
    if (!data || data.version !== 1) { storageState = 'newer'; readOnly = true; enabled = false; return; }
    if (typeof data.enabled !== 'boolean') { storageState = 'invalid'; enabled = false; return; }
    enabled = data.enabled;
    wallpaper = typeof data.wallpaper === 'boolean' ? data.wallpaper : true;
    stickers = typeof data.stickers === 'boolean' ? data.stickers : true;
    panelBlur = readPanelBlur(data);
    advancedBlur = typeof data?.advancedBlur === 'boolean' ? data.advancedBlur : DEFAULT_ADVANCED_BLUR;
  }

  function readCustom() {
    if (!storage) return;
    const raw = readRaw(CUSTOM_KEY);
    if (raw === null) return;
    let data;
    // A corrupt customization record must never take the theme down with it:
    // only the record is dropped, and the shipped colors stay in force.
    try { data = JSON.parse(raw); }
    catch { return; }
    if (!data || typeof data !== 'object') return;
    // A newer record belongs to a later plugin version: leave it untouched and
    // say so, so this session's edits stay temporary instead of half-overwriting it.
    if (data.version !== 1) {
      if (typeof data.version === 'number' && data.version > 1) { readOnly = true; storageState = 'newer'; }
      return;
    }
    colors = sanitizePalette(data.palette);
    title = sanitizeText(data.title, TEXT_LIMITS.title);
    description = sanitizeText(data.description, TEXT_LIMITS.description);
    greeting = sanitizeText(data.greeting, TEXT_LIMITS.greeting);
    modeNames = sanitizeModeNames(data.modeNames);
    stickerNames = sanitizeStickerNames(data.stickerNames);
  }

  function read() {
    readPreference();
    readCustom();
    palette = resolvePalettes(colors);
  }

  function persist() {
    if (readOnly) return;
    try {
      if (!storage) throw new Error('storage unavailable');
      storage.setItem(STORAGE_KEY, JSON.stringify({ version:1, enabled, wallpaper, stickers, panelBlur, advancedBlur }));
      storageState = 'saved';
    } catch { storageState = 'unavailable'; }
  }

  function persistCustom() {
    if (readOnly) return;
    try {
      if (!storage) throw new Error('storage unavailable');
      storage.setItem(CUSTOM_KEY, JSON.stringify({ version:1, palette:colors, title, description, greeting, modeNames, stickerNames }));
      storageState = 'saved';
    } catch { storageState = 'unavailable'; }
  }

  function publish() {
    if (disposed) return;
    const active = theme.getTheme();
    snapshot = Object.freeze({
      enabled, wallpaper, stickers, panelBlur, advancedBlur, storageState, imageState, notice,
      preference:active.preference,
      scheme:active.active.colorScheme,
      palette,
      colors:Object.freeze({ light:Object.freeze({ ...colors.light }), dark:Object.freeze({ ...colors.dark }) }),
      title, description, greeting,
      modeNames:Object.freeze({ ...modeNames }),
      stickerNames:Object.freeze([...stickerNames]),
      images:Object.freeze({ wallpaper:images.wallpaper, stickers:Object.freeze([...images.stickers]) })
    });
    for (const listener of listeners) listener();
  }

  function reconcile() {
    if (release) { const old = release; release = undefined; old(); }
    if (enabled) {
      const tokens = buildTokenOverrides(palette);
      release = theme.overrideTokens(SOURCE_ID, wallpaper ? buildArtOverrides(tokens) : tokens);
    }
    publish();
  }

  async function loadImages() {
    if (!imageStore || disposed) return;
    try {
      const stored = await imageStore.load();
      if (disposed) return;
      images = {
        wallpaper: stored?.wallpaper ?? null,
        stickers: Array.from({ length:STICKER_SLOTS }, (_, index) => stored?.['sticker:' + index] ?? null)
      };
      imageState = 'ready';
    } catch { imageState = 'unavailable'; }
    publish();
  }

  read();
  reconcile();
  loadImages();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    syncTheme: publish,
    syncStorage() {
      if (disposed) return;
      enabled = true; wallpaper = true; stickers = true; panelBlur = DEFAULT_PANEL_BLUR; advancedBlur = DEFAULT_ADVANCED_BLUR; readOnly = false; storageState = 'saved';
      colors = EMPTY_COLORS(); title = ''; description = ''; greeting = '';
      modeNames = EMPTY_MODE_NAMES(); stickerNames = EMPTY_STICKER_NAMES();
      notice = '';
      read(); reconcile(); loadImages();
    },
    choose(mode) {
      if (disposed) return;
      if (!['default','light','dark','system'].includes(mode)) throw new Error('Unknown appearance mode');
      // Native light/dark/system preferences stay under the Host's persistence.
      if (mode !== 'default') theme.setTheme(mode);
      enabled = mode !== 'default';
      persist(); reconcile();
    },
    setDecoration(name, value) {
      if (disposed) return;
      if (!['wallpaper', 'stickers'].includes(name) || typeof value !== 'boolean') throw new Error('Invalid decoration');
      if (name === 'wallpaper') wallpaper = value;
      else stickers = value;
      persist(); reconcile();
    },
    /** Turn the message-panel Gaussian blur on or off. Persisted with the other
     * toggles; only meaningful while the wallpaper layer is up, which is what the
     * panels blur. */
    setPanelBlur(value) {
      if (disposed) return;
      if (typeof value !== 'boolean') throw new Error('Invalid message blur');
      panelBlur = value;
      persist(); reconcile();
    },
    /** Turn the wide blur halo around the input card on or off. Same gate as the
     * panel blur: it blurs the wallpaper, so it needs the wallpaper layer. */
    setAdvancedBlur(value) {
      if (disposed) return;
      if (typeof value !== 'boolean') throw new Error('Invalid advanced blur');
      advancedBlur = value;
      persist(); reconcile();
    },
    /** Set or clear one palette entry. An empty value removes the override.
     * A historical auxiliary key (`pink`/`gold`/`lilac`) is accepted and folded
     * onto its current name, so callers written earlier keep working.
     * @returns true when the color was accepted. */
    setColor(mode, key, value) {
      if (disposed) return false;
      if (!MODE_KEYS.includes(mode)) throw new Error('Unknown palette mode');
      const name = paletteKey(key);
      if (!name || !Object.hasOwn(palette[mode], name)) throw new Error('Unknown palette entry');
      const next = { ...colors[mode] };
      const color = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (/^#[0-9a-f]{6}$/.test(color)) next[name] = color;
      else if (color === '') delete next[name];
      else return false;
      colors = { ...colors, [mode]: next };
      palette = resolvePalettes(colors);
      persistCustom(); reconcile();
      return true;
    },
    /** Replace one free-text copy field; empty restores the built-in copy. */
    setCopy(field, value) {
      if (disposed) return;
      if (!Object.hasOwn(TEXT_LIMITS, field)) throw new Error('Unknown copy field');
      const text = sanitizeText(value, TEXT_LIMITS[field]);
      if (field === 'title') title = text;
      else if (field === 'description') description = text;
      else greeting = text;
      persistCustom(); publish();
    },
    /** Rename the light or dark appearance; empty restores the built-in name. */
    setModeName(mode, value) {
      if (disposed) return;
      if (!MODE_KEYS.includes(mode)) throw new Error('Unknown appearance name');
      modeNames = { ...modeNames, [mode]: sanitizeText(value, NAME_LIMIT) };
      persistCustom(); publish();
    },
    /** Rename one sticker slot; empty restores the built-in name. */
    setStickerName(index, value) {
      if (disposed) return;
      if (!Number.isInteger(index) || index < 0 || index >= STICKER_SLOTS) throw new Error('Unknown sticker name slot');
      const next = [...stickerNames];
      next[index] = sanitizeText(value, NAME_LIMIT);
      stickerNames = next;
      persistCustom(); publish();
    },
    /** Store or clear one image slot. A null blob restores the shipped artwork. */
    async setImage(kind, index, blob) {
      if (disposed) return false;
      const key = imageKey(kind, index);
      if (!key) throw new Error('Unknown image slot');
      if (!imageStore) { notice = 'imageUnavailable'; publish(); return false; }
      const next = blob ?? null;
      try {
        if (next) await imageStore.write(key, next);
        else await imageStore.remove(key);
      } catch { if (!disposed) { notice = 'imageFailed'; publish(); } return false; }
      if (disposed) return false;
      if (kind === 'wallpaper') images = { ...images, wallpaper: next };
      else { const slots = [...images.stickers]; slots[index] = next; images = { ...images, stickers: slots }; }
      notice = '';
      publish();
      return true;
    },
    /** Apply colours only. Images, copy and names are left exactly as they
     * are, so a palette file can be handed around without carrying a wallpaper.
     * @param patch - `{ light, dark }` maps of optional `#rrggbb` overrides.
     * @returns true when at least one token was accepted. */
    applyPalette(patch) {
      if (disposed) return false;
      const next = sanitizePalette(patch);
      let changed = 0;
      for (const mode of MODE_KEYS) {
        for (const [key, value] of Object.entries(next[mode])) {
          // Compare against the resolved look, not the override record: writing
          // the factory value again is not a change. Shipped palettes keep their
          // historical uppercase hex, so compare case-insensitively.
          if (String(palette[mode][key]).toLowerCase() !== value) changed++;
        }
      }
      if (changed === 0) return false;
      colors = { light: { ...colors.light, ...next.light }, dark: { ...colors.dark, ...next.dark } };
      palette = resolvePalettes(colors);
      persistCustom(); reconcile();
      return true;
    },
    /** Apply a validated configuration document plus its decoded images.
     * @returns true when every part, including images, was applied. */
    async applyConfig(config, imageBlobs) {
      if (disposed) return false;
      colors = { light: { ...config.palette.light }, dark: { ...config.palette.dark } };
      title = config.title; description = config.description; greeting = config.greeting;
      modeNames = { ...config.modeNames };
      stickerNames = [...config.stickerNames];
      palette = resolvePalettes(colors);
      persistCustom();
      // Images are only adopted once they are durably stored; otherwise the
      // card would show artwork that disappears on the next load.
      let ok = false;
      if (imageStore) {
        try {
          await imageStore.clear();
          for (let index = 0; index < STICKER_SLOTS; index++) {
            const blob = imageBlobs?.stickers?.[index];
            if (blob) await imageStore.write('sticker:' + index, blob);
          }
          if (imageBlobs?.wallpaper) await imageStore.write('wallpaper', imageBlobs.wallpaper);
          images = {
            wallpaper: imageBlobs?.wallpaper ?? null,
            stickers: Array.from({ length:STICKER_SLOTS }, (_, index) => imageBlobs?.stickers?.[index] ?? null)
          };
          imageState = 'ready';
          ok = true;
        } catch { imageState = 'unavailable'; }
      }
      if (disposed) return false;
      notice = ok ? '' : 'imageFailed';
      reconcile();
      return ok;
    },
    /** Drop color overrides for one mode, or both when `mode` is omitted. */
    resetColors(mode) {
      if (disposed) return;
      if (mode === undefined) colors = EMPTY_COLORS();
      else if (MODE_KEYS.includes(mode)) colors = { ...colors, [mode]: {} };
      else throw new Error('Unknown palette mode');
      palette = resolvePalettes(colors);
      persistCustom(); reconcile();
    },
    /** Drop the custom title, description, greeting and appearance names. */
    resetCopy() {
      if (disposed) return;
      title = ''; description = ''; greeting = '';
      modeNames = EMPTY_MODE_NAMES();
      persistCustom(); publish();
    },
    /** Drop every customization, including the stored images. */
    async resetAll() {
      if (disposed) return;
      colors = EMPTY_COLORS();
      title = ''; description = ''; greeting = '';
      modeNames = EMPTY_MODE_NAMES(); stickerNames = EMPTY_STICKER_NAMES();
      palette = resolvePalettes(colors);
      persistCustom();
      let ok = true;
      if (imageStore) { try { await imageStore.clear(); } catch { ok = false; } }
      if (disposed) return;
      images = EMPTY_IMAGES();
      notice = ok ? '' : 'imageFailed';
      reconcile();
    },
    /** Show a localized status message for the last operation. */
    notify(code) {
      if (disposed) return;
      notice = typeof code === 'string' ? code : '';
      publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release?.(); release = undefined; listeners.clear();
    }
  };
}
