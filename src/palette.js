// The shipped default palettes. Both are user-editable at runtime; the values
// below are the factory defaults used whenever a color has no override.
export const PALETTES = Object.freeze({
  light: Object.freeze({ base:'#FAF8F2', surface:'#FFFFFF', sidebar:'#E5F2F2', raised:'#F2F8F7', elevated:'#FFFFFF', text:'#243D52', secondary:'#496376', tertiary:'#607788', muted:'#5B7180', accent:'#227C89', accentHover:'#196875', accentSoft:'#D8EEEB', onAccent:'#FFFFFF', border:'#C8DBDC', hover:'#DEEEEB', code:'#EDF3F4', support1:'#DB8F9E', support2:'#CFB47E', support3:'#DBD5EA' }),
  dark: Object.freeze({ base:'#15283B', surface:'#1B3043', sidebar:'#1B3245', raised:'#20384A', elevated:'#294559', text:'#F2F3F1', secondary:'#C2D5DF', tertiary:'#A1B9C8', muted:'#94ADBE', accent:'#8EDDD5', accentHover:'#ACE9E2', accentSoft:'#294E57', onAccent:'#142C3B', border:'#426073', hover:'#294556', code:'#102236', support1:'#E8ACB9', support2:'#D6BF90', support3:'#CFC4E5' })
});

/** Every editable palette entry, in the order the settings card shows them. */
export const PALETTE_KEYS = Object.freeze(Object.keys(PALETTES.light));

/** The three auxiliary colors, indexed as the card shows them. Their key names
 * used to be `pink` / `gold` / `lilac`; the display names never did. */
export const SUPPORT_KEYS = Object.freeze(['support1', 'support2', 'support3']);

/** Historical key names for the auxiliary colors. Files exported before the
 * rename — and the customization records written under them — still import,
 * because the old names are folded onto the new ones on the way in. */
export const LEGACY_PALETTE_KEYS = Object.freeze({ pink:'support1', gold:'support2', lilac:'support3' });

/** Resolve a palette key, folding a historical auxiliary name onto its current
 * one. Returns null for a key this build does not know.
 * @param key - candidate palette key.
 * @returns the current key name, or null.
 */
export function paletteKey(key) {
  if (PALETTE_KEYS.includes(key)) return key;
  return LEGACY_PALETTE_KEYS[key] ?? null;
}

/** Editable colors are restricted to `#rrggbb` so `<input type="color">` round-trips. */
export const COLOR_PATTERN = /^#[0-9a-f]{6}$/;

/** Whether a value is a six-digit hex color.
 * @param value - candidate color.
 * @returns true when the value is a valid `#rrggbb` string.
 */
export function isColor(value) {
  return typeof value === 'string' && COLOR_PATTERN.test(value.trim().toLowerCase());
}

/** Lowercase a six-digit hex color, or null when it is not one. `<input type="color">`
 * only accepts the canonical lowercase form, so every stored color is normalized.
 * @param value - candidate color.
 * @returns the normalized color, or null.
 */
export function normalizeColor(value) {
  return isColor(value) ? value.trim().toLowerCase() : null;
}

// Alias-token dictionary for one palette. Content cards keep opaque colors; only
// the page canvas reveals the wallpaper, which ART_OVERRIDES relaxes.
function tokenMap(p) {
  const t = {};
  const assign = (value, ...names) => names.forEach(name => { t['--dsw-alias-' + name] = value; });
  assign(p.base, 'bg-base');
  assign(p.surface, 'bg-layer-1', 'button-floating-fill');
  assign(p.raised, 'bg-layer-2', 'bg-document-preview', 'button-elevated-fill', 'button-info-fill', 'markdown-code-block-banner');
  assign(p.elevated, 'bg-layer-3', 'bg-overlay');
  assign(p.sidebar, 'bg-module-platform');
  assign(p.text, 'label-primary', 'label-primary-bluish', 'label-document-preview', 'menu-icon');
  assign(p.secondary, 'label-secondary', 'label-caption');
  assign(p.tertiary, 'label-tertiary');
  assign(p.muted, 'label-dimmed', 'label-primary-dimmed', 'markdown-placeholder');
  assign(p.accent, 'brand-primary', 'brand-primary-invert', 'brand-primary-new-colorprimary-new-color', 'brand-text', 'button-primary-fill', 'button-contrast-fill', 'link', 'state-business-primary');
  assign(p.accentHover, 'button-primary-hover');
  assign(p.onAccent, 'label-primary-inverted', 'label-primary-foreground');
  assign(p.border, 'border-l1', 'border-l2', 'border-l2-darkmode-thin', 'border-l3', 'border-l4', 'button-ghost-active-border');
  assign(p.hover, 'interactive-bg-hover', 'interactive-bg-hover-solid', 'button-floating-hover', 'button-info-hover', 'button-tool-bar-hover', 'button-ghost-active-hover');
  assign(p.accentSoft, 'interactive-bg-active', 'interactive-bg-hover-accent', 'bg-multi-select', 'button-ghost-active-fill', 'button-primary-dimmed', 'markdown-citation', 'markdown-tag', 'markdown-code-segment-selected');
  assign(p.code, 'markdown-code-block', 'markdown-inline-code', 'markdown-code-segment-unselected');
  assign(p.raised, 'bg-skeleton', 'button-tool-bar-fill');
  assign(p.border, 'scrollbar-bg-l1', 'scrollbar-bg-l2');
  assign(p.tertiary, 'scrollbar-hover-l1', 'scrollbar-hover-l2');
  // Error, warning, success and diff tokens retain the platform's meanings.
  SUPPORT_KEYS.forEach((key, index) => { t['--dct-support' + (index + 1)] = p[key]; });
  // The variables under their pre-rename names, so stylesheets written against
  // the old names keep resolving; the settings card no longer uses them.
  Object.entries(LEGACY_PALETTE_KEYS).forEach(([old, current]) => { t['--dct-' + old] = p[current]; });
  t['--dct-on-accent'] = p.onAccent;
  // Background images and illustrated controls can extend the theme later.
  t['--dct-selection'] = p.accentSoft;
  t['--dsw-specific-sidebar-fill'] = p.sidebar;
  t['--dsw-specific-input-major'] = p.surface;
  t['--dsw-specific-bubble'] = p.raised;
  t['--dsw-specific-menu'] = p.elevated;
  t['--dsw-menu-backdrop-filter'] = 'none';
  return t;
}

/** Merge user overrides onto the shipped palettes. Unknown keys and invalid
 * colors are ignored, so a partially corrupt record can never blank a token.
 * @param custom - `{ light, dark }` maps of optional `#rrggbb` overrides.
 * @returns frozen `{ light, dark }` palettes ready for token building.
 */
export function resolvePalettes(custom) {
  const merge = (base, over) => {
    const out = { ...base };
    if (over && typeof over === 'object') {
      for (const [raw, value] of Object.entries(over)) {
        // A record written before the auxiliary colors were renamed carries the
        // old key; fold it onto the current one so a saved look survives.
        const key = paletteKey(raw);
        const color = key ? normalizeColor(value) : null;
        if (color) out[key] = color;
      }
    }
    return Object.freeze(out);
  };
  return Object.freeze({
    light: merge(PALETTES.light, custom && custom.light),
    dark: merge(PALETTES.dark, custom && custom.dark)
  });
}

/** Build the ThemeRuntime override layer for a resolved palette pair.
 * @param palette - resolved `{ light, dark }` palettes.
 * @returns token-name → `{ light, dark }` value pairs.
 */
export function buildTokenOverrides(palette) {
  const light = tokenMap(palette.light);
  const dark = tokenMap(palette.dark);
  const out = {};
  for (const name of Object.keys(light)) out[name] = Object.freeze({ light: light[name], dark: dark[name] });
  return Object.freeze(out);
}

/** Relax the app shell so the wallpaper can show through; content cards stay opaque.
 * @param tokenOverrides - the layer produced by {@link buildTokenOverrides}.
 * @returns the art-mode override layer.
 */
export function buildArtOverrides(tokenOverrides) {
  return Object.freeze({ ...tokenOverrides,
    '--dsw-alias-bg-base': Object.freeze({light:'transparent',dark:'transparent'}),
    // Desktop's preload also reads this token to color native caption buttons.
    '--dsw-specific-sidebar-fill': Object.freeze({light:'transparent',dark:'transparent'}),
    '--dsw-specific-bubble': Object.freeze({light:'transparent',dark:'transparent'})
  });
}

/** Default token layer, kept for callers that want the shipped colors. */
export const OVERRIDES = buildTokenOverrides(PALETTES);
/** Default art-mode token layer. */
export const ART_OVERRIDES = buildArtOverrides(OVERRIDES);
