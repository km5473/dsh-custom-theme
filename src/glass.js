// Conversation-surface effects.
//
// Two things live here:
//
//  1. `gaussianGlassCss` — the "chat bubble" panel styling, ported from the
//     upstream project's 0.3.4 onto this plugin's `data-dct-*` markers: a static
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

/** The work-steps dropdown renders every step as a whole assistant message of
 * its own, so each one carries its own markdown root. Decorating those roots
 * drew a second card and a second blur ring inside the dropdown — a frame
 * around a single step instead of around the answer. Panels therefore stop at
 * that boundary; the step rows get no card at all. */
const NOT_IN_STEPS = ':not([data-step-process-content] *)';
const DECORATED = `${PANELS}${NOT_IN_STEPS}`;

/** A reasoning disclosure: the frame the steps used to get by accident now
 * belongs to the thinking box itself, so every thinking box looks the same
 * whether it sits inline in the answer or inside the steps dropdown. It is a
 * semantic hook (`data-variant="think"`), not a build hash. */
const THINK = '[data-variant="think"]';
/** Frost radius for the thinking box: exactly one pixel more than the 3px the
 * message panels carry, so the box reads as the same material and not a step
 * heavier. */
const THINK_BLUR = 4;

// Static Gaussian material: no canvas, SVG displacement or pointer animation.
export function gaussianGlassCss() {
  return `body[data-dct-material] ${DECORATED}{position:relative;z-index:0;box-sizing:border-box;max-width:100%;min-width:0;padding:18px 22px;border:1px solid rgba(186,228,233,.32);border-radius:24px;background:rgba(21,40,59,.12);box-shadow:0 3px 12px rgba(7,25,40,.06);overflow-wrap:anywhere;color:#f3f8fc;text-shadow:0 1px 2px rgba(0,0,0,.22)}
body[data-dct-material][data-dct-art="light"] ${DECORATED}{background:rgba(250,248,242,.16);border-color:rgba(54,103,117,.28);color:#173447;text-shadow:none}
/* Thinking boxes: the same frame the panels carry, so a reasoning row reads as
   a box of its own wherever it is rendered. The frame follows the theme switch
   rather than the Gaussian one — the box is structure, and it must not vanish
   when the blur is off.
   The host collapses a reasoning row to a fixed 24px height under
   contain: size layout (on .lcKema_root:not([data-expanded])), so the frame's
   padding left no content box at all and the single line spilled out of its own
   border. Collapsed rows therefore size to their one line again: height auto,
   and size containment dropped (layout containment stays). */
body[data-dct-theme] ${THINK}{position:relative;z-index:0;box-sizing:border-box;max-width:100%;min-width:0;padding:6px 12px;border:1px solid rgba(186,228,233,.34);border-radius:24px;background:rgba(21,40,59,.14)}
body[data-dct-theme] ${THINK}:not([data-expanded]){height:auto;contain:layout}
body[data-dct-theme][data-dct-art="light"] ${THINK}{background:rgba(250,248,242,.20);border-color:rgba(54,103,117,.34)}
/* A frost that does not depend on backdrop sampling: the wallpaper is painted a
   second time inside the box, blurred and clipped to its rounded edge, so the box
   reads as frosted glass even where backdrop-filter finds no backdrop to sample —
   inside a scrolling dropdown, or in a transcript reopened from history. The
   border is redrawn above that layer so the frost cannot cover it. */
body[data-dct-theme][data-dct-art] ${THINK}{overflow:hidden;background-color:transparent;border-color:transparent}
body[data-dct-art] ${THINK}::before{content:"";position:absolute;inset:-20px;z-index:-1;pointer-events:none;background-image:linear-gradient(rgba(21,40,59,.22),rgba(21,40,59,.22)),var(--dct-scene);background-size:cover;background-position:center;background-attachment:fixed;filter:blur(${THINK_BLUR}px) saturate(104%)}
body[data-dct-art="light"] ${THINK}::before{background-image:linear-gradient(rgba(250,248,242,.30),rgba(250,248,242,.30)),var(--dct-scene)}
body[data-dct-art] ${THINK}::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(186,228,233,.34)}
body[data-dct-art="light"] ${THINK}::after{box-shadow:inset 0 0 0 1px rgba(54,103,117,.34)}
/* The material's own blur sits on a pseudo-element rather than on the panel: an
   element with backdrop-filter becomes a backdrop root, and the advanced-blur ring
   around the panel would then sample the panel's own paint instead of the page.
   The panel carries z-index:0 (a plain stacking context, which is NOT a backdrop
   root) so both pseudos can drop to z-index:-1 and paint behind the text. */
body[data-dct-material] ${DECORATED}::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
/* The thinking box keeps its frost on the element itself: nothing else needs to
   paint behind its text, so a pseudo-element would only add a stacking layer. */
body[data-dct-material] ${DECORATED} pre{max-width:100%;overflow-x:auto}
body[data-dct-theme] ${THINK} pre{max-width:100%;overflow-x:auto}
@media(prefers-reduced-transparency:reduce){body[data-dct-material] ${DECORATED}{background:#122d40}body[data-dct-material] ${DECORATED}::before{backdrop-filter:none;-webkit-backdrop-filter:none}body[data-dct-material][data-dct-art="light"] ${DECORATED}{background:#f4faf8}body[data-dct-theme] ${THINK}{backdrop-filter:none;-webkit-backdrop-filter:none}}
@media(max-width:700px){body[data-dct-material] ${DECORATED}{padding:14px 16px}body[data-dct-theme] ${THINK}{padding:5px 10px}}`;
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
 * both the stats line and the context ring. DSH 0.2.1 marks that element with
 * `data-composer-dock` and renders the stats as `_pill` chips inside it; older
 * hosts instead flagged the stats row itself with `data-composer-stats`, so that
 * class + `:has` pair stays as a fallback. Requiring a `_pill` child keeps the
 * capsule off a dock that has nothing to wrap. */
const COMPOSER_DOCK = '[data-composer-dock]:has([class*="_pill"]),[class$="_dock"]:has([data-composer-stats]),[class*="_dock "]:has([data-composer-stats])';

/** Composer chrome. The send box is painted with a near-opaque tint and **no**
 * backdrop filter: hovering the send / stop button repaints the card, and a
 * filtered background makes Windows / Electron re-composite it, which shows up as
 * the whole composer flickering (the same failure the upstream project fixed in
 * 0.3.1). The tint alone carries the look; the wallpaper is barely visible through
 * it anyway. */
export function pageEffectCss() {
  return `
/* The send box keeps its near-opaque tint; the tint is the whole effect. */
body[data-dct-art] ${COMPOSER_CARD}:has([class$="_input"], [class*="_input "]){background:var(--dct-input-glass);background-image:none;border:1px solid var(--dsw-alias-border-l2);backdrop-filter:none;-webkit-backdrop-filter:none}
/* The stats line and the context ring share one capsule: it is painted on the
   composer dock, the only element that holds both, so the pill hugs them as a
   single chip instead of stopping at the stats row. Pure decoration: no event is
   attached and the dock keeps its own layout — only its box grows by the padding.
   The fill is the palette's opaque sidebar colour (--dsw-alias-bg-module-platform),
   which keeps following the colour picked in the settings card. Not
   --dsw-specific-sidebar-fill: wallpaper mode knocks that one out to transparent.
   Radius is forced: the host paints its own rounding on this row, so a plain
   declaration would lose to it and the ends would not close into full circles. */
body[data-dct-theme] ${COMPOSER_DOCK}{padding:0 14px;border-radius:999px!important;corner-shape:round;background:var(--dsw-alias-bg-module-platform)}
/* Lift the input card a couple of pixels. The card is already a positioned box in
   the host sheet (position:relative), so top shifts only the painted box: the
   strip, the info bar and the capsule keep their layout and stay where they were. */
body[data-dct-theme] ${COMPOSER_CARD}:has([class$="_input"], [class*="_input "]){top:-${CARD_LIFT}px}
/* Advanced blur: a ring of wider Gaussian blur around every message panel, as a
   border for it. z-index:-1 keeps it under the panel's text (the panel is a
   stacking context), and the panel carries no backdrop-filter, so the ring really
   samples the page behind the panel. */
body[data-dct-advblur] ${DECORATED}::after{content:"";position:absolute;inset:-${ADVANCED_RING}px;box-sizing:border-box;padding:${ADVANCED_RING}px;border-radius:inherit;pointer-events:none;z-index:-1;backdrop-filter:blur(${ADVANCED_BLUR}px) saturate(104%);-webkit-backdrop-filter:blur(${ADVANCED_BLUR}px) saturate(104%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask-composite:exclude}
/* The work-steps dropdown body only needs the horizontal overflow gone, but not
   through a clipping scroll container: a backdrop-filter inside one only ever
   samples the scroller's own contents, which is why the thinking boxes lost
   their frost while the dropdown was open. The rows are kept inside the body's
   width instead, so nothing overflows in the first place. */
body[data-dct-theme] [data-step-process-content]{min-width:0;max-width:100%;box-sizing:border-box}
body[data-dct-theme] [data-step-process-content]>*{min-width:0;max-width:100%}
@media(prefers-reduced-transparency:reduce),(forced-colors:active){
body[data-dct-advblur] ${DECORATED}::after{content:none}
}
/* The permission and model pickers open in a portalled list surface (a direct
   child of body carrying the _portal_ / _list_ roles). The theme left it
   translucent, so the wallpaper showed through the list; paint it with the opaque
   menu colour instead. Matched by role token, never by build hash. */
/* Picker and popover surfaces, made solid. Portalled popovers default to the
   elevated layer — the plus menu (the command palette) lives here. Picker menus drop
   to the raised layer: the permission popup carries option labels, and the model /
   reasoning popup paints its own _menu panel, portalled without the UI kit's
   _portal_ wrapper. Role tokens only, never a build hash; the triggers stay as they
   are. */
body[data-dct-theme] > [class*="_portal_"]{background:var(--dsw-alias-bg-layer-3);background-image:none;backdrop-filter:none;-webkit-backdrop-filter:none}
body[data-dct-theme] > [class*="_portal_"]:has([class*="_optionLabel"]){background:var(--dsw-alias-bg-layer-2)}
body[data-dct-theme] [class*="_menu"]{background:var(--dsw-alias-bg-layer-2);background-image:none;backdrop-filter:none;-webkit-backdrop-filter:none}
/* The open-in-app split button (the folder + chevron pair in the composer path
   bar). Its own halves are transparent in the host sheet, but the chip it is
   mounted in carries the pale raised fill, so the pair reads as a stray card next
   to the composer's transparent chips. Strip the fill from that whole chain and
   keep the control's own chrome: the 0.5px outline around the split and the
   divider between the two halves are what make it legible, so they stay.
   Matched by the semantic \`data-open-target\` / \`menuAnchor\` hooks, never by build
   hash; the dock, the input card, portals and the panels are excluded so their
   fills (the info-bar capsule, the card glass) survive. */
body[data-dct-theme] [data-open-target]{background:transparent!important;background-image:none!important;border:.5px solid var(--dsw-alias-border-l4)!important;border-radius:var(--dsw-radius-sm)}
body[data-dct-theme] [data-open-target] > button{background:transparent!important;background-image:none!important;border:0!important}
body[data-dct-theme] [data-open-target] > button + button{border-left:.5px solid var(--dsw-alias-border-l4)!important}
body[data-dct-theme] [data-open-target] > button:is(:hover,:focus-visible):not(:disabled){background:var(--dsw-alias-interactive-bg-hover)!important}
body[data-dct-theme] [class*="menuAnchor"]{background:transparent!important;background-image:none!important}
/* Menu panels that are not portalled straight under body (the row "more actions"
   menu is one: its trigger is a plain ghost button, the panel mounts elsewhere) are
   not reached by the portal rule above, so the kit's material layer keeps the
   host's translucent menu colour and the wallpaper shows through the list. Paint
   that layer solid with the elevated layer, the same colour the portalled menus
   get. The shell's stylesheet has exactly one _material_ class and no installed
   plugin renders one, so the role token cannot hit anything else. */
body[data-dct-theme] [class*="_material_"]{background:var(--dsw-alias-bg-layer-3);background-image:none;backdrop-filter:none;-webkit-backdrop-filter:none}
/* Wide markdown tables: the host deliberately lets a 4+-column table break out
   of the message column all the way to the chat area (AssistantMarkdown widens
   it with container-query maths: spare = (100cqw - chat content width) / 2).
   Inside the theme's padded, rounded message panel that breakout pushes the
   table past the card edge, so the last columns hang outside the "chat box".
   Cancel the breakout and pin the table to the message width instead. The
   table may still wrap; the wrapper scrolls only when cells cannot shrink
   (the host gives every cell a 100px minimum).
   The 5px bottom padding the host reserves for the hidden scrollbar is dropped
   too: the host zeroes it on :hover, and with the scrollbar now always
   available that swap made the table jump while the pointer sat on the bar.
   With one steady padding the bar appears once and stays put.
   The host's :hover / :focus-visible override is more specific than the rule
   below and flips overflow-x to scroll. On a table that fits, that forced a
   12px-tall scrollbar into view on pointer-over and shoved the next line down,
   so the same steady overflow-x:auto is repeated for those states. */
body[data-dct-theme] .md-table-wide,
body[data-dct-theme] .md-table-wide:hover,
body[data-dct-theme] .md-table-wide:focus-visible{--dsh-table-spare:0px;--dsh-table-lead:0px;box-sizing:border-box;width:100%;max-width:100%;min-width:0;margin-left:0;padding-left:0;padding-bottom:0;overflow-x:auto;overscroll-behavior-x:contain}
body[data-dct-theme] .md-table-wide>table{max-width:100%}
/* The host's global scrollbar is 5px tall and the bar sits flush against the
   table's bottom edge. The wider hit area is kept for comfort even though it was
   not what made the bar feel undraggable: the layout swap on :hover was. A
   transparent 3px border keeps the painted thumb 6px, so it still looks like the
   rest of the UI. */
body[data-dct-theme] .md-table-wide::-webkit-scrollbar{height:12px}
body[data-dct-theme] .md-table-wide::-webkit-scrollbar-thumb{border:3px solid transparent}
body[data-dct-theme] .md-table-wide::-webkit-scrollbar-track{background:transparent}`;
}
