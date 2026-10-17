// Conversation-surface effects.
//
// Two things live here:
//
//  1. `gaussianGlassCss` — the "chat bubble" panel styling, ported from
//     dsh-vesna-theme 0.3.4 onto this plugin's `data-dct-*` markers: a static
//     blur with no canvas, SVG filter or pointer animation, so it stays cheap
//     while scrolling. It is gated on `data-dct-material`, the marker the panel
//     switch owns. The upstream liquid-glass rim was dropped — the settings card
//     now offers a single Gaussian on/off switch.
//  2. `pageEffectCss` — composer effects: the 3px backdrop blur behind the send
//     box and the sidebar-coloured capsule on the info bar.
//
// Everything is keyed off markers on `document.body`, so switching the theme off
// restores the native surface. No DOM is replaced: the model answer is decorated
// in place, so streaming, copy buttons and text selection keep working.

/** Message panels: the user bubble and the model answer.
 *
 * The model answer has no bubble wrapper in DSH, so its existing root is
 * decorated. `.v5IAXa_root` / `.kshsua_root` are CSS-module roles observed in
 * shipped builds; discovery through the host stylesheet plus the
 * `data-dct-assistant` marker keeps working when those hashes change.
 */
const PANELS = ':is(.v5IAXa_root,.kshsua_root,[data-dct-assistant],[class$="_userRow"] [class$="_bubble"],[class*="_userRow "] [class*="_bubble "])';

// Static Gaussian material: no canvas, SVG displacement or pointer animation.
export function gaussianGlassCss() {
  return `body[data-dct-material] ${PANELS}{position:relative;z-index:0;box-sizing:border-box;max-width:100%;min-width:0;padding:18px 22px;border:1px solid rgba(186,228,233,.32);border-radius:24px;background:rgba(21,40,59,.12);box-shadow:0 3px 12px rgba(7,25,40,.06);overflow-wrap:anywhere;color:#f3f8fc;text-shadow:0 1px 2px rgba(0,0,0,.22)}
body[data-dct-material][data-dct-art="light"] ${PANELS}{background:rgba(250,248,242,.16);border-color:rgba(54,103,117,.28);color:#173447;text-shadow:none}
/* The material's own blur sits on a pseudo-element rather than on the panel: an
   element with backdrop-filter becomes a backdrop root, and the advanced-blur ring
   around the panel would then sample the panel's own paint instead of the page.
   The panel carries z-index:0 (a plain stacking context, which is NOT a backdrop
   root) so both pseudos can drop to z-index:-1 and paint behind the text. */
body[data-dct-material] ${PANELS}::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
body[data-dct-material] ${PANELS} pre{max-width:100%;overflow-x:auto}
@media(prefers-reduced-transparency:reduce){body[data-dct-material] ${PANELS}{background:#122d40}body[data-dct-material] ${PANELS}::before{backdrop-filter:none;-webkit-backdrop-filter:none}body[data-dct-material][data-dct-art="light"] ${PANELS}{background:#f4faf8}}
@media(max-width:700px){body[data-dct-material] ${PANELS}{padding:14px 16px}}`;
}

/** Gaussian material markers: only discovers the reply renderer, so scrolling
 * and pointer movement cost nothing at all. */
export function installGaussianMessageMarkers() {
  const marks=new Map();let timer=0,disposed=false;
  const scan=()=>{timer=0;if(disposed)return;const prefixes=new Set();for(const s of document.querySelectorAll('style'))for(const m of s.textContent.matchAll(/\.([\w-]+)_body\s+\.md-table-wide\s*\{/g))prefixes.add(m[1]);
  for(const prefix of prefixes)for(const root of document.querySelectorAll('.'+CSS.escape(prefix+'_root'))){if(![...root.children].some(x=>x.classList.contains(prefix+'_body')))continue;if(!marks.has(root))marks.set(root,root.getAttribute('data-dct-assistant'));root.setAttribute('data-dct-assistant','true')}
  for(const[root]of marks)if(!root.isConnected)marks.delete(root);
  };
  const observer=new MutationObserver(()=>{if(!timer)timer=setTimeout(scan,100)});observer.observe(document.documentElement,{childList:true,subtree:true});scan();
  return()=>{disposed=true;clearTimeout(timer);observer.disconnect();for(const[root,old]of marks){if(old===null)root.removeAttribute('data-dct-assistant');else root.setAttribute('data-dct-assistant',old)}marks.clear()};
}

/** Owns the message-panel blur marker and the engine behind it: setting
 * `data-dct-material` selects the stylesheet, the manager installs the Gaussian
 * marker scan. Called on every controller change, and a no-op unless the switch,
 * the enable switch or the wallpaper switch actually moved. */
export function createPanelBlurManager() {
  const body=document.body,previous=body.getAttribute('data-dct-material'),previousRing=body.getAttribute('data-dct-advblur');let on=null,ring=null,disposeEngine=null;
  return {
    sync(state){
      // The wide halo only paints over the wallpaper, so it follows the same gate.
      const nextRing=Boolean(state.enabled&&state.wallpaper&&state.advancedBlur);
      if(nextRing!==ring){ring=nextRing;if(nextRing)body.setAttribute('data-dct-advblur','');else body.removeAttribute('data-dct-advblur')}
      const next=Boolean(state.enabled&&state.wallpaper&&state.panelBlur);
      if(next===on)return;
      disposeEngine?.();disposeEngine=null;on=next;
      if(next){body.setAttribute('data-dct-material','gaussian');disposeEngine=installGaussianMessageMarkers()}
      else body.removeAttribute('data-dct-material');
    },
    dispose(){disposeEngine?.();disposeEngine=null;on=null;ring=null;if(previous===null)body.removeAttribute('data-dct-material');else body.setAttribute('data-dct-material',previous);if(previousRing===null)body.removeAttribute('data-dct-advblur');else body.setAttribute('data-dct-advblur',previousRing)}
  };
}


// ---------------------------------------------------------------------------
// Page effect: the send box blur.
// ---------------------------------------------------------------------------

/** Blur applied behind the send box. Deliberately small: it is meant to soften
 * the wallpaper under a near-opaque tint, not to frost the composer. */
export const INPUT_BLUR = 3;
/** Pixels the input card is lifted by, so it breathes against the info bar below
 * it. Applied as a relative offset: the card is already a positioned box, and
 * `top` moves only what is painted, never the strip's layout. */
export const CARD_LIFT = 2;
/** Advanced blur: a wider Gaussian ring wrapped around every message panel.
 * `ADVANCED_BLUR` is the blur radius inside that ring — deliberately larger than
 * the panel material's own 3px — and `ADVANCED_RING` is how thick the ring is. */
export const ADVANCED_BLUR = 10;
export const ADVANCED_RING = 2;
/** The host's composer markup: a card that contains the text input. */
const COMPOSER_CARD = ':is([class$="_card"],[class*="_card "])';
/** The info bar's own row: the host's composer dock, the only element holding
 * both the stats line and the context ring. Matched by class token plus the stats
 * row it contains, so no other module's `_dock` picks the rule up. */
const COMPOSER_DOCK = ':is([class$="_dock"],[class*="_dock "])';

/** Stylesheet for the send-box blur, which keys off `data-dct-art` (the
 * wallpaper layer): with the wallpaper off the composer keeps its plain tint and
 * no filter is applied at all. */
export function pageEffectCss() {
  return `
/* The send box keeps its near-opaque tint and gains a small blur. Kept in one
   rule so the tint and the blur cannot drift apart. */
body[data-dct-art] ${COMPOSER_CARD}:has([class$="_input"], [class*="_input "]){background:var(--dct-input-glass);background-image:none;border:1px solid var(--dsw-alias-border-l2);backdrop-filter:blur(${INPUT_BLUR}px) saturate(104%);-webkit-backdrop-filter:blur(${INPUT_BLUR}px) saturate(104%)}
@media(prefers-reduced-transparency:reduce),(forced-colors:active){
body[data-dct-art] ${COMPOSER_CARD}:has([class$="_input"], [class*="_input "]){backdrop-filter:none;-webkit-backdrop-filter:none}
}
/* The stats line and the context ring share one capsule: it is painted on the
   composer dock, the only element that holds both, so the pill hugs them as a
   single chip instead of stopping at the stats row. Pure decoration: no event is
   attached and the dock keeps its own layout — only its box grows by the padding.
   The fill is the palette's opaque sidebar colour (--dsw-alias-bg-module-platform),
   which keeps following the colour picked in the settings card. Not
   --dsw-specific-sidebar-fill: wallpaper mode knocks that one out to transparent.
   Radius is forced: the host paints its own rounding on this row, so a plain
   declaration would lose to it and the ends would not close into full circles. */
body[data-dct-theme] ${COMPOSER_DOCK}:has([data-composer-stats]){padding:0 14px;border-radius:999px!important;corner-shape:round;background:var(--dsw-alias-bg-module-platform)}
/* Lift the input card a couple of pixels. The card is already a positioned box in
   the host sheet (position:relative), so top shifts only the painted box: the
   strip, the info bar and the capsule keep their layout and stay where they were. */
body[data-dct-theme] ${COMPOSER_CARD}:has([class$="_input"], [class*="_input "]){top:-${CARD_LIFT}px}
/* Advanced blur: a ring of wider Gaussian blur around every message panel, as a
   border for it. z-index:-1 keeps it under the panel's text (the panel is a
   stacking context), and the panel carries no backdrop-filter, so the ring really
   samples the page behind the panel. */
body[data-dct-advblur] ${PANELS}::after{content:"";position:absolute;inset:-${ADVANCED_RING}px;box-sizing:border-box;padding:${ADVANCED_RING}px;border-radius:inherit;pointer-events:none;z-index:-1;backdrop-filter:blur(${ADVANCED_BLUR}px) saturate(104%);-webkit-backdrop-filter:blur(${ADVANCED_BLUR}px) saturate(104%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask-composite:exclude}
@media(prefers-reduced-transparency:reduce),(forced-colors:active){
body[data-dct-advblur] ${PANELS}::after{content:none}
}
/* The permission and model pickers open in a portalled list surface (a direct
   child of body carrying the _portal_ / _list_ roles). The theme left it
   translucent, so the wallpaper showed through the list; paint it with the opaque
   menu colour instead. Matched by role token, never by build hash. */
/* Picker menus (permission, model / reasoning level) open as a portalled surface
   with menu / listbox roles, and the theme left them translucent so the wallpaper
   showed through. Paint those surfaces with the palette's sidebar tint — solid and
   in keeping with the rest of the theme. The triggers outside are untouched. */
body[data-dct-theme] > [class*="_portal_"][class*="_list_"],body[data-dct-theme] :is([role="menu"],[role="listbox"]){background:var(--dsw-alias-bg-layer-2);background-image:none;backdrop-filter:none;-webkit-backdrop-filter:none}`;
}
