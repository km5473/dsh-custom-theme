// Browser-only image persistence and upload preprocessing.
//
// Images never go into localStorage: the shipped artwork alone is ~3 MB, and a
// re-encoded wallpaper plus six stickers would blow the origin quota and take
// the whole theme preference down with it. IndexedDB stores Blobs natively and
// is not subject to that quota, so it owns the bytes while localStorage keeps
// the small, synchronous customization record.
import { UPLOAD_LIMITS, IMAGE_LIMITS, STICKER_SLOTS } from './config.js';

/** Object-store keys, in a fixed order so a fresh install reads predictably. */
export const IMAGE_KEYS = Object.freeze(['wallpaper', ...Array.from({ length: STICKER_SLOTS }, (_, index) => 'sticker:' + index)]);

/** IndexedDB database used before the plugin was renamed; read once for migration. */
export const LEGACY_IMAGE_DATABASE = 'dsh-vesna-theme';

/** Map a settings-card slot onto its store key.
 * @param kind - 'wallpaper' or 'sticker'.
 * @param index - sticker slot, ignored for the wallpaper.
 * @returns the store key, or null for an unknown slot.
 */
export function imageKey(kind, index) {
  if (kind === 'wallpaper') return 'wallpaper';
  if (kind === 'sticker' && Number.isInteger(index) && index >= 0 && index < STICKER_SLOTS) return 'sticker:' + index;
  return null;
}

/** Longest edge kept for each slot kind; larger uploads are downscaled in place. */
const MAX_EDGE = Object.freeze({ wallpaper: 2560, sticker: 320 });

/** Decode an uploaded file into something drawable.
 * @param file - the chosen image file.
 * @returns an ImageBitmap or HTMLImageElement.
 */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); }
    catch { /* Fall through to the <img> path for formats the decoder rejects. */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be decoded')); };
    image.src = url;
  });
}

/** Encode a canvas, resolving null when the browser refuses the format. */
function encode(canvas, type, quality) {
  return new Promise(resolve => {
    try { canvas.toBlob(blob => resolve(blob ?? null), type, quality); }
    catch { resolve(null); }
  });
}

/** Re-encode an uploaded image so stored and exported bytes stay bounded.
 * Transparency survives because WebP and PNG both carry an alpha channel.
 * @param file - the chosen image file.
 * @param kind - 'wallpaper' or 'sticker', selecting the size budget.
 * @returns the normalized Blob, or the original file when re-encoding is impossible.
 * @throws when the upload exceeds its raw size budget.
 */
export async function normalizeImage(file, kind) {
  if (!file || typeof file.size !== 'number') throw new Error('No image was provided');
  if (file.size > UPLOAD_LIMITS[kind]) { const error = new Error('Upload is too large'); error.code = 'imageTooLarge'; throw error; }

  const bitmap = await decode(file);
  const width = bitmap.width || bitmap.naturalWidth || 0;
  const height = bitmap.height || bitmap.naturalHeight || 0;
  let blob = file;
  if (width > 0 && height > 0) {
    const scale = Math.min(1, MAX_EDGE[kind] / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      blob = (await encode(canvas, 'image/webp', 0.92)) ?? (await encode(canvas, 'image/png')) ?? file;
    }
  }
  if (typeof bitmap.close === 'function') bitmap.close();
  if (blob.size > IMAGE_LIMITS[kind]) { const error = new Error('Processed image is too large'); error.code = 'imageTooLarge'; throw error; }
  return blob;
}

/** Read a Blob as a base64 data URL for the exported configuration file. */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Image could not be read'));
    reader.readAsDataURL(blob);
  });
}

/** Turn an embedded data URL back into a Blob for storage. */
export function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) throw new Error('Malformed data URL');
  const mime = dataUrl.slice(5, comma).split(';')[0] || 'application/octet-stream';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

/** Trigger a client-side download of an exported file. */
export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** IndexedDB-backed store for the wallpaper and sticker bytes.
 * `load` resolves to a key→Blob map; write/remove/clear resolve to true or reject.
 *
 * When `legacyDatabase` names an earlier plugin's database and this store is
 * still empty, its entries are copied forward on the first load, so renaming
 * the plugin does not discard artwork the user already chose.
 *
 * @param options - `{ database, legacyDatabase }`.
 * @returns the store adapter consumed by the controller.
 */
export function createIndexedImageStore(options = {}) {
  const database = options.database ?? 'dsh-custom-theme';
  const legacyDatabase = options.legacyDatabase;
  const store = 'assets';
  let opening;
  const open = () => opening ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || indexedDB === null) { reject(new Error('IndexedDB is unavailable')); return; }
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another window'));
  });

  const transaction = async (mode, work) => {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      let settled = false;
      const fail = error => { if (!settled) { settled = true; reject(error ?? new Error('Image storage failed')); } };
      tx.oncomplete = () => { if (!settled) { settled = true; resolve(true); } };
      tx.onerror = () => fail(tx.error);
      tx.onabort = () => fail(tx.error);
      try { work(tx.objectStore(store)); }
      catch (error) { fail(error); }
    });
  };

  const readAll = db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const objectStore = tx.objectStore(store);
    const keys = objectStore.getAllKeys();
    const values = objectStore.getAll();
    tx.oncomplete = () => {
      const out = {};
      const keyList = keys.result ?? [];
      const valueList = values.result ?? [];
      for (let index = 0; index < keyList.length; index++) out[String(keyList[index])] = valueList[index];
      resolve(out);
    };
    tx.onerror = () => reject(tx.error ?? new Error('Image storage could not be read'));
  });

  /** Entries from a pre-rename database, or {} when it cannot be inspected.
   * `indexedDB.databases()` is required so a missing legacy database is never
   * created just by looking for it. */
  const readLegacy = async () => {
    if (!legacyDatabase || typeof indexedDB.databases !== 'function') return {};
    let names;
    try { names = (await indexedDB.databases()).map(entry => entry?.name); }
    catch { return {}; }
    if (!names.includes(legacyDatabase)) return {};
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(legacyDatabase);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Previous image storage could not be opened'));
    });
    try {
      if (!db.objectStoreNames.contains(store)) return {};
      return await readAll(db);
    } finally { db.close(); }
  };

  return {
    async load() {
      const stored = await readAll(await open());
      if (Object.keys(stored).length > 0) return stored;
      const previous = await readLegacy();
      const carried = Object.entries(previous);
      if (carried.length === 0) return stored;
      // Copy first, report second: a half-finished migration must not lose bytes.
      await transaction('readwrite', objectStore => { for (const [key, blob] of carried) objectStore.put(blob, key); });
      return previous;
    },
    async write(key, blob) { return await transaction('readwrite', objectStore => { objectStore.put(blob, key); }); },
    async remove(key) { return await transaction('readwrite', objectStore => { objectStore.delete(key); }); },
    async clear() { return await transaction('readwrite', objectStore => { objectStore.clear(); }); }
  };
}
