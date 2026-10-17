// End-to-end smoke test of the BUILT bundle. It materializes `lib/client.js`
// through a fake module loader, runs the plugin body against a minimal DOM and
// a fake cordis context, and actually renders the settings card. This is the
// gate that must pass before the artifact is copied into a live profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(root, 'lib/client.js');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// ---- minimal DOM -----------------------------------------------------------

const HEAD_SELECTOR = 'titleGroup';

/** The `[class$="_role"]` / `[class*="_role "]` halves of a CSS-module selector. */
const selectorMatches = selector => Array.from(selector.matchAll(/\[class[$*]?="([^"]+)"\]/g)).map(match => match[1]);

/** Does `className` satisfy one of the selector tokens this fake DOM knows?
 * A `[class$="_role"]` pattern is a suffix, since that is how CSS-module role
 * classes are matched in the real page; a plain `.foo` token is exact. */
function classSatisfies(className, selectors) {
  const names = className.split(/\s+/).filter(Boolean);
  return selectors.some(selector => names.some(name => name === selector || name.endsWith(selector)));
}

/** Every class selector a fake-DOM query string is asking for: the
 * `[class$="_role"]` role patterns plus any plain `.token` class selectors. */
function classSelectors(selector) {
  return [
    ...selectorMatches(selector),
    ...Array.from(selector.matchAll(/\.([\w-]+)/g)).map(match => match[1])
  ];
}

/** Fake-DOM search: supports the class selectors, plain `[data-*]` hooks, a
 * trailing `:has(...)` descendant test and the `style`/`headline` lookups this
 * plugin performs. `scope` limits the walk to an element's descendants, which
 * is what `element.querySelector` needs. */
function findAll(selector, scope, nodes = []) {
  if (selector === 'style') return (scope ? [scope] : []).flatMap(visit => (visit.children ?? []).filter(child => child.tagName === 'style'));
  if (selector.includes(HEAD_SELECTOR) || selector.includes('_titleGroup')) return nodes;
  const has = selector.match(/:has\(([^)]*)\)/);
  const own = has ? selector.slice(0, has.index) : selector;
  const attributes = own.trim().startsWith('[') ? Array.from(own.matchAll(/\[([\w-]+)\]/g)).map(match => match[1]) : [];
  const patterns = attributes.length ? [] : classSelectors(own);
  if (patterns.length === 0 && attributes.length === 0) return [];
  const found = [];
  const contains = (node, wanted) => (node.children ?? []).some(child =>
    classSatisfies(typeof child.className === 'string' ? child.className : '', wanted) || contains(child, wanted));
  const visit = node => {
    const className = typeof node.className === 'string' ? node.className : '';
    const hit = attributes.length
      ? attributes.every(name => name in (node.attributes ?? {}))
      : classSatisfies(className, patterns);
    if (hit && (!has || contains(node, classSelectors(has[1])))) found.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  if (scope) for (const child of scope.children ?? []) visit(child);
  return found;
}

function makeElement(tag) {
  return {
    tagName: tag, children: [], attributes: {}, dataset: {}, textContent: '',
    style: {
      setProperty(name, value) { this[name] = String(value); },
      removeProperty(name) { delete this[name]; },
      getPropertyValue(name) { return this[name] ?? ''; }
    },
    className: '', hidden: false, isConnected: true, parentNode: null, value: '',
    get classList() {
      const names = () => this.className.split(/\s+/).filter(Boolean);
      return { contains: name => names().includes(name), add: () => {}, remove: () => {} };
    },
    appendChild(child) { this.children.push(child); child.parentNode = this; child.parentElement = this; return child; },
    append(...nodes) { for (const node of nodes) this.appendChild(node); },
    insertBefore(node, reference) {
      this.children = this.children.filter(child => child !== node);
      const index = reference ? this.children.indexOf(reference) : -1;
      if (index === -1) this.children.push(node); else this.children.splice(index, 0, node);
      node.parentNode = this; node.parentElement = this;
      return node;
    },
    get firstChild() { return this.children[0] ?? null; },
    get nextSibling() {
      const siblings = this.parentNode?.children ?? [];
      return siblings[siblings.indexOf(this) + 1] ?? null;
    },
    querySelector(selector) { return findAll(selector, this)[0] ?? null; },
    querySelectorAll(selector) { return findAll(selector, this); },
    remove() { this.isConnected = false; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    removeAttribute(name) { delete this.attributes[name]; },
    toggleAttribute(name, force) { if (force) this.attributes[name] = ''; else delete this.attributes[name]; },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { top:0, left:0, right:0, bottom:0, width:0, height:0 }; },
    closest() { return null; },
    contains() { return false; },
    matches(selector) { return classSatisfies(this.className, selectorMatches(selector)); },
    querySelectorAll() { return []; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); return child; }
  };
}

/** Fake `CanvasRenderingContext2D`: enough for `installLiquidGlassOptics` to
 * build one lens without touching a real drawing surface. */
function makeCanvas() {
  return {
    width: 0, height: 0,
    createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {}, getImageData: (x, y, width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    toDataURL: () => 'data:image/png;base64,'
  };
}

function makeDom() {
  const head = makeElement('head');
  const body = makeElement('body');
  const hero = makeElement('span');
  hero.textContent = 'DeepSeek';
  const nodes = [];
  // A stand-in for the host's reply-renderer stylesheet: it carries the
  // `.md-table-wide` rule the message-glass discovery reads to learn the
  // renderer's CSS-module prefix. Without it the discovery finds nothing, which
  // is why the marker step also accepts the known role classes directly.
  const hostStyle = makeElement('style');
  hostStyle.textContent = '.v5IAXa_body .md-table-wide{width:100%;overflow-x:auto}';
  head.appendChild(hostStyle);
  // The theme's page effects look for the composer card and, under it, the
  // "tokens / cache hit" stats dock; this tree has neither, which is the
  // "no artwork installed" path they must survive.
  const findAllHere = selector => selector === 'style'
    ? head.children.filter(child => child.tagName === 'style')
    : findAll(selector, body, nodes);
  const document = {
    head, body,
    createElement: makeElement,
    createElementNS: (namespace, tag) => makeElement(tag),
    querySelector: selector => findAllHere(selector)[0] ?? null,
    querySelectorAll: findAllHere,
    addEventListener() {}, removeEventListener() {}
  };
  return { document, body, hero, nodes, created: [] };
}

function makeSandbox(dom) {
  const sandbox = {
    console,
    Blob, URL, atob, btoa, Uint8Array, Uint8ClampedArray, Object, JSON, Math, Date, Array, Promise, Error, RegExp, String, Number, Boolean, Symbol, Map, Set, WeakMap, TypeError, isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
    document: dom.document,
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    // Page effects measure the composer and the viewport; with no composer in
    // the fake tree they fall through to the viewport width.
    innerWidth: 1280, innerHeight: 800,
    requestAnimationFrame: callback => { callback(0); return 1; },
    cancelAnimationFrame: () => {},
    // The conversation pane is the only scrollable box in the fake tree; every
    // other ancestor reports `visible`, so the search must land on the pane and
    // not on the composer column.
    getComputedStyle: element => ({ overflowY: element?.scrolls ? 'auto' : 'visible' }),
    Element: class {},
    CSS: { supports: () => false, escape: value => value },
    HTMLCanvasElement: class {},
    indexedDB: undefined,
    // `typeof indexedDB === 'undefined'` is what the image store checks; keep it
    // absent so the unavailable-store path is the one exercised here.
    __ModuleLoader__: null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const listeners = { resize: [], blur: [] };
  sandbox.addEventListener = (type, fn) => { (listeners[type] ??= []).push(fn); };
  sandbox.removeEventListener = () => {};
  return sandbox;
}

// ---- fake cordis context ---------------------------------------------------

function makeContext() {
  const state = { preference: 'light' };
  const record = { overrides: [], effects: [], locales: [], slot: null };
  const ctx = {
    theme: {
      getTheme: () => ({ preference: state.preference, active: { colorScheme: state.preference === 'dark' ? 'dark' : 'light', tokens: {} } }),
      setTheme: mode => { state.preference = mode; },
      overrideTokens: (source, tokens) => { record.overrides.push({ source, tokens }); return () => {}; }
    },
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') record.effects.push(dispose); return () => {}; },
    on: () => {},
    locale: { register: (namespace, dictionary) => record.locales.push({ namespace, dictionary }) },
    slots: {
      inject: (name, factory) => { if (name === 'settings.general.item') record.injectFactory = factory; },
      register: (config, component) => { record.slot = { config, component }; return () => {}; }
    }
  };
  return { ctx, state, record };
}

// The card receives `t` from the locale registry; read the real dictionaries out
// of the built bundle so a missing key shows up as a raw key in this test.
function readDictionaries(code) {
  const start = code.indexOf('const dictionaries =');
  const end = code.indexOf('const MODES =');
  assert.ok(start !== -1 && end > start, 'dictionaries block not found in the bundle');
  return new Function(code.slice(start, end) + '\nreturn dictionaries;')();
}

/** The settings-card stylesheet exactly as the bundle ships it. */
function readCardCss(code) {
  const end = code.lastIndexOf(',ASSETS)};');
  const start = code.lastIndexOf('applyClient(ctx,React,', end) + 'applyClient(ctx,React,'.length;
  assert.ok(start > 0 && end > start, 'embedded card stylesheet not found');
  return JSON.parse(code.slice(start, end));
}

function loadBundle() {
  const code = fs.readFileSync(bundlePath, 'utf8');
  const dom = makeDom();
  const sandbox = makeSandbox(dom);
  let spec;
  sandbox.__ModuleLoader__ = { load: captured => { spec = captured; } };
  vm.runInNewContext(code, sandbox, { filename: 'lib/client.js' });
  assert.ok(spec, 'the bundle did not register a module');
  return { code, spec, dom, sandbox };
}

function makeReact() {
  const requested = new Set();
  const React = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false && child !== true) };
    },
    useState: initial => [initial, () => {}],
    useRef: initial => ({ current: initial }),
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot()
  };
  return { React, requested };
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return; }
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

// ---- the tests -------------------------------------------------------------

test('the built bundle registers the plugin and materializes its exports', () => {
  const { spec } = loadBundle();
  // The module id the Host resolves the entry by must be the package name.
  assert.equal(spec.id, pkg.name);
  const { React } = makeReact();
  const plugin = spec.factory(name => { assert.equal(name, 'react'); return React; });
  // The bundle is evaluated in its own realm, so re-wrap its array before comparing.
  assert.deepEqual([...plugin.inject], ['theme', 'slots', 'locale']);
  assert.equal(typeof plugin.apply, 'function');
});

test('the bundled artwork decodes to real WebP images', () => {
  const { code } = loadBundle();
  const match = code.match(/\nconst ASSETS=(\{.*\});\n/);
  assert.ok(match, 'ASSETS payload not found');
  const assets = JSON.parse(match[1]);
  const images = [assets.wallpaper, ...assets.individual];
  assert.equal(images.length, 7);
  for (const [index, dataUrl] of images.entries()) {
    assert.match(dataUrl, /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/, `asset ${index} is not a WebP data URL`);
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `asset ${index} lacks a RIFF header`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `asset ${index} lacks a WEBP tag`);
    assert.ok(bytes.length > 1000, `asset ${index} looks truncated`);
  }
});

test('applying the plugin installs tokens, artwork, hero copy and the settings slot', async () => {
  const { code, spec, dom } = loadBundle();
  const dictionaries = readDictionaries(code);
  const { React } = makeReact();
  const plugin = spec.factory(() => React);
  const { ctx, record } = makeContext();

  // The conversation pane (scrollable), the composer column inside it, and the
  // stats dock. The bottom blur measures the distance from the composer's top to
  // the pane's bottom, so all three need a rect.
  const pane = makeElement('div');
  pane.className = 'lXshSW_pane';
  pane.scrolls = true;
  pane.getBoundingClientRect = () => ({ top:0, left:220, right:1060, bottom:660, width:840, height:660 });
  const composer = makeElement('div');
  composer.className = 'lXshSW_root';
  composer.style = { position: 'relative' };
  const card = makeElement('div');
  card.className = 'lXshSW_card';
  card.getBoundingClientRect = () => ({ top:600, left:220, right:1060, bottom:660, width:840, height:60 });
  const input = makeElement('textarea');
  input.className = 'lXshSW_input';
  card.appendChild(input);
  const dock = makeElement('div');
  dock.className = 'lXshSW_dock';
  const stats = makeElement('div');
  stats.className = 'bOPqQW_root';
  stats.attributes['data-composer-stats'] = '';
  stats.getBoundingClientRect = () => ({ top:540, left:220, right:1060, bottom:560, width:840, height:20 });
  dock.appendChild(stats);
  composer.appendChild(card);
  composer.appendChild(dock);
  pane.appendChild(composer);
  dom.body.appendChild(pane);

  plugin.apply(ctx);

  // Token layer.
  assert.equal(record.overrides.length, 1);
  assert.equal(record.overrides[0].source, 'dsh-custom-theme');
  const tokens = record.overrides[0].tokens;
  assert.deepEqual({ ...tokens['--dsw-alias-brand-primary'] }, { light:'#227C89', dark:'#8EDDD5' });
  assert.deepEqual({ ...tokens['--dsw-alias-bg-base'] }, { light:'transparent', dark:'transparent' });
  assert.deepEqual({ ...tokens['--dct-support2'] }, { light:'#CFB47E', dark:'#D6BF90' });
  // The pre-rename auxiliary variables stay defined for older stylesheets.
  assert.deepEqual({ ...tokens['--dct-gold'] }, { light:'#CFB47E', dark:'#D6BF90' });

  // Stylesheets: the card CSS and the generated art CSS, both marked as ours.
  const styles = dom.document.head.children.filter(child => child.tagName === 'style');
  const plugins = styles.map(style => style.dataset.plugin);
  assert.ok(plugins.includes('dsh-custom-theme'), 'card stylesheet missing');
  assert.ok(plugins.includes('dsh-custom-theme-art'), 'art stylesheet missing');
  const art = styles.find(style => style.dataset.plugin === 'dsh-custom-theme-art');
  assert.match(art.textContent, /body\[data-dct-art="light"\]/);
  assert.match(art.textContent, /--dct-scene:linear-gradient/);
  assert.ok(!art.textContent.includes('data:image/webp'), 'art CSS must carry blob URLs, not base64 payloads');
  assert.equal((art.textContent.match(/blob:/g) ?? []).length >= 7, true, 'expected one blob URL per sticker plus the wallpaper');

  // The input card carries a small backdrop blur (the 3px send-box blur) and
  // still a near-opaque tint: the tint is what actually hides the wallpaper
  // behind it, so a hover repaint stays cheap.
  const artLines = art.textContent.split('\n');
  const tints = artLines.filter(line => line.includes('--dct-input-glass:'));
  assert.equal(tints.length, 2, 'one input tint per scheme');
  assert.ok(tints.some(line => line.includes('.92')), 'the dark input tint should be near opaque');
  assert.ok(tints.some(line => line.includes('.95')), 'the light input tint should be near opaque');
  const inputCards = artLines.filter(line => line.includes('var(--dct-input-glass)') && line.includes('{'));
  assert.equal(inputCards.length, 2, 'one tint rule in the art sheet and one blur rule in the glass sheet');
  // The tint rule (art sheet) stays blur-free; the glass sheet adds the blur.
  assert.ok(inputCards.some(line => !line.includes('backdrop-filter')), 'the tint rule must stay blur-free');
  assert.ok(inputCards.some(line => /backdrop-filter:blur\(3px\)/.test(line)), 'the send box should get the 3px blur');
  // The other glass layers keep their blur.
  assert.match(art.textContent, /blur\(8px\)/, 'sidebar/top-bar/right-rail blur should stay');

  // The chat-panel effect: one Gaussian material, gated on the marker the switch
  // owns rather than on the wallpaper marker, so switching it off restores the
  // native surface. The upstream liquid-glass rim is gone for good.
  assert.match(art.textContent, /data-dct-material\] :is\(\.v5IAXa_root/, 'the panel blur rules should ship');
  assert.ok(art.textContent.includes('::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;backdrop-filter:blur(3px)'), 'the panel material blur should ride on ::before, under the text');
  assert.ok(art.textContent.includes('z-index:0;box-sizing:border-box'), 'the panel must be a plain stacking context so the pseudos can sit under the text');
  assert.match(art.textContent, /data-dct-advblur\] :is\(\.v5IAXa_root/, 'the advanced blur ring should ship');
  assert.ok(art.textContent.includes('inset:-2px;box-sizing:border-box;padding:2px'), 'the ring should be 2px thick');
  assert.ok(art.textContent.includes('pointer-events:none;z-index:-1;backdrop-filter:blur(10px)'), 'the ring must paint under the text and blur wider than the panel material');
  assert.ok(art.textContent.includes('> [class*="_portal_"]{background:var(--dsw-alias-bg-layer-3)'), 'portalled popovers (the plus menu) should sit on the elevated fill');
  assert.ok(art.textContent.includes('> [class*="_portal_"]:has([class*="_optionLabel"]){background:var(--dsw-alias-bg-layer-2)'), 'the permission picker popup should narrow to the raised fill');
  assert.ok(art.textContent.includes('body[data-dct-theme] [class*="_menu"]{background:var(--dsw-alias-bg-layer-2)'), 'the model picker menu (its own portal, no _portal_ wrapper) must be solid too');
  assert.ok(!art.textContent.includes('background-color:var(--dsw-alias-interactive-bg-hover)'), 'the picker triggers must be left alone');
  assert.ok(!art.textContent.includes('--dct-edge-filter'), 'the liquid glass rim must be gone');
  assert.ok(!art.textContent.includes('corner-shape:superellipse'), 'the liquid glass silhouette must be gone');
  assert.equal(dom.body.getAttribute('data-dct-material'), 'gaussian', 'the blur is on by default');
  assert.equal(dom.body.getAttribute('data-dct-advblur'), '', 'the advanced blur ring is on by default');

  // No blur band of any kind ships: every attempt was pulled back out, so
  // neither the layer, its marker nor any of its CSS may linger.
  assert.equal(dom.document.querySelector('.dct-fade'), null, 'no blur-band layer may be installed');
  assert.ok(!art.textContent.includes('dct-fade'), 'no blur-band CSS should ship');
  assert.ok(!art.textContent.includes('dct-fade-step'), 'no blur-grade CSS should ship');

  // Native dropdowns are re-tinted: Windows paints the option list itself, so
  // the dark scheme would otherwise show white on white. (Upstream 0.3.4.)
  const dropdown = artLines.find(line => line.includes('option') && line.includes('{'));
  assert.ok(dropdown, 'a dropdown rule should exist');
  assert.ok(dropdown.includes('--dsw-alias-bg-layer-2') && dropdown.includes('--dsw-alias-label-primary'), 'dropdown text must stay readable');

  // Mid-run the composer's primary button becomes the stop button (same element,
  // label switched). Our tokens paint it with the pale `raised` fill, so it must
  // be re-pointed at the accent colour — and only while the theme is on.
  const stopRule = artLines.find(line => line.includes('aria-label^="停止"') && line.includes('{'));
  assert.ok(stopRule, 'a stop-button rule should exist');
  assert.ok(stopRule.includes('var(--dsw-alias-brand-primary)'), 'the stop button should use the accent colour');
  assert.ok(stopRule.includes('var(--dsw-alias-label-primary-inverted)'), 'the stop button glyph should use the on-accent colour');
  assert.match(stopRule, /^body\[data-dct-theme\]/, 'the stop-button rule must be scoped to the enabled theme');
  const stopHover = artLines.find(line => line.includes('aria-label^="停止"') && line.includes(':hover'));
  assert.ok(stopHover && stopHover.includes('--dsw-alias-button-primary-hover'), 'stop hover should use the accent hover colour');

  // Body markers drive the CSS.
  assert.equal(dom.body.getAttribute('data-dct-theme'), '', 'the theme marker should be present while enabled');
  assert.equal(dom.body.getAttribute('data-dct-art'), 'light');
  assert.equal(dom.body.getAttribute('data-dct-stickers'), '');
  assert.equal(dom.body.getAttribute('data-dct-personal'), '');

  // Locale registration.
  assert.deepEqual(record.locales.map(entry => entry.namespace), ['settings.custom-theme']);
  assert.ok(Object.keys(record.locales[0].dictionary.zh).length >= 60);

  // The settings slot is registered and injects the live controller.
  assert.equal(typeof record.injectFactory, 'function');
  record.injectFactory();
  assert.ok(record.slot, 'settings slot was not registered');
  assert.equal(record.slot.config.id, 'custom-theme');
  const controller = record.slot.config.inject().controller;
  assert.ok(controller && typeof controller.getSnapshot === 'function');

  // Hero copy: the greeting is written into the real title node.
  dom.nodes.push(dom.hero);
  controller.notify();
  assert.equal(dom.hero.textContent, '找我什么事呀，亲爱的朋友~');
  controller.setCopy('greeting', '早上好呀');
  assert.equal(dom.hero.textContent, '早上好呀');
  controller.setCopy('greeting', '');
  assert.equal(dom.hero.textContent, '找我什么事呀，亲爱的朋友~');

  // Let the asynchronous image load settle (no IndexedDB here, so it reports unavailable).
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().imageState, 'unavailable');
});

test('the settings card renders every state and only uses defined locale keys', () => {
  const { code, spec, dom } = loadBundle();
  const dictionaries = readDictionaries(code);
  const zh = dictionaries.zh;
  const en = dictionaries.en;
  for (const key of Object.keys(zh)) assert.equal(typeof en[key], 'string', `en is missing ${key}`);
  const css = readCardCss(code);
  const used = new Set();
  const t = key => { used.add(key); return zh[key] ?? key; };

  const { React } = makeReact();
  const plugin = spec.factory(() => React);
  const { ctx, record } = makeContext();
  plugin.apply(ctx);
  record.injectFactory();
  const controller = record.slot.config.inject().controller;
  const Card = record.slot.component;

  const render = () => Card({ controller, t });

  const cards = [
    ['default light', render],
    ['dark', () => { controller.choose('dark'); return render(); }],
    ['wallpaper off', () => { controller.setDecoration('wallpaper', false); return render(); }],
    ['stickers off', () => { controller.setDecoration('stickers', false); return render(); }],
    ['wallpaper back on', () => { controller.setDecoration('wallpaper', true); controller.setDecoration('stickers', true); return render(); }],
    ['custom colors', () => { controller.setColor('light', 'accent', '#123456'); controller.setColor('dark', 'pink', '#654321'); return render(); }],
    ['custom copy', () => { controller.setCopy('title', '我的主题'); controller.setCopy('description', '自定义描述'); controller.setCopy('greeting', '你好'); return render(); }],
    ['custom names', () => { controller.setModeName('light', '樱花白'); controller.setModeName('dark', '墨夜'); controller.setStickerName(0, '打招呼'); return render(); }],
    ['theme disabled', () => { controller.choose('default'); return render(); }]
  ];

  for (const [label, run] of cards) {
    const tree = run();
    assert.equal(tree.type, 'section', label);
    assert.equal(tree.props.className, 'dct-card', label);
    let inputs = 0; let images = 0; let buttons = 0; let details = 0;
    const classes = new Set();
    walk(tree, node => {
      if (typeof node.props?.className === 'string') for (const name of node.props.className.split(' ')) if (name) classes.add(name);
      if (node.type === 'input') inputs++;
      if (node.type === 'img') images++;
      if (node.type === 'button') buttons++;
      if (node.type === 'details') details++;
      if (node.type === 'img') assert.match(node.props.src, /^(blob:|data:)/, label + ': image source');
      if (node.type === 'span' && node.props.className === 'dct-sticker') assert.match(node.props.style.backgroundImage, /^url\("(blob:|data:)/, label + ': sticker source');
    });
    // Every class the card renders must have a rule, or the row silently loses its styling.
    for (const name of classes) assert.ok(css.includes('.' + name), `${label}: card.css has no rule for .${name}`);
    assert.ok(inputs >= 1, label + ': expected inputs');
    assert.ok(buttons >= 4, label + ': expected the appearance buttons');
    if (label === 'theme disabled') {
      // With the theme off the card hides the wallpaper preview and the whole
      // customization block, leaving only the color swatches.
      assert.equal(images, 0, label + ': no artwork previews while disabled');
      assert.equal(details, 0, label + ': no customization sections while disabled');
    } else {
      assert.ok(images >= 1, label + ': expected image previews');
      assert.equal(details, 3, label + ': three customization sections');
    }
    // Colors are edited as hex text, never as a native color picker.
    walk(tree, node => { if (node.type === 'input') assert.notEqual(node.props.type, 'color', label + ': no native color picker'); });
  }

  // Custom names reach the appearance buttons, the colour group headings and the gallery.
  // The last state above turned the theme off, which hides the gallery, so turn it back on.
  controller.choose('light');
  const texts = [];
  walk(render(), node => { for (const child of node.children ?? []) if (typeof child === 'string') texts.push(child); });
  for (const expected of ['樱花白', '墨夜', '打招呼']) assert.ok(texts.includes(expected), `card should show ${expected}`);
  // Clearing a name falls back to the localized default.
  controller.setStickerName(0, '');
  controller.setModeName('light', '');
  const cleared = [];
  walk(render(), node => { for (const child of node.children ?? []) if (typeof child === 'string') cleared.push(child); });
  assert.ok(cleared.includes(zh.greeting), 'cleared sticker name should fall back to the built-in label');
  assert.ok(cleared.includes(zh.light), 'cleared appearance name should fall back to the built-in label');

  // Every locale key the card asks for must exist in the dictionary.
  const missing = [...used].filter(key => !(key in zh));
  assert.deepEqual(missing, [], 'undefined locale keys: ' + missing.join(', '));
  // The 19 editable colors must each have a label.
  for (const key of ['base','surface','sidebar','raised','elevated','text','secondary','tertiary','muted','accent','accentHover','accentSoft','onAccent','border','hover','code','support1','support2','support3']) {
    assert.ok(used.has('color_' + key), 'missing label for ' + key);
  }
});

test('the chat-panel blur switch drives the body marker and restores the markers', async () => {
  const { spec, dom } = loadBundle();
  const { React } = makeReact();
  const plugin = spec.factory(() => React);
  const { ctx, record } = makeContext();

  // A model answer: the reply renderer's root carrying the body child the
  // discovery step looks for. The fake element tree has no host stylesheet, so
  // the build-hash discovery finds nothing and the explicit root is what the
  // marker step has to fall back on.
  const root = makeElement('div');
  root.className = 'v5IAXa_root';
  root.dataset.bodyPrefix = 'v5IAXa';
  const body = makeElement('div');
  body.className = 'v5IAXa_body';
  root.appendChild(body);
  dom.body.appendChild(root);

  plugin.apply(ctx);
  record.injectFactory();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(dom.body.getAttribute('data-dct-material'), 'gaussian', 'the blur is on by default');
  assert.equal(root.getAttribute('data-dct-assistant'), 'true', 'the Gaussian engine should mark model answers');

  const controller = record.slot.config.inject().controller;
  controller.setPanelBlur(false);
  assert.equal(dom.body.getAttribute('data-dct-material'), null, 'switching the blur off takes the layer down');
  controller.setPanelBlur(true);
  assert.equal(dom.body.getAttribute('data-dct-material'), 'gaussian', 'the switch brings it back');
  assert.equal(root.getAttribute('data-dct-assistant'), 'true', 'the marker scan should run again');

  // The advanced-blur ring has its own marker and its own switch.
  controller.setAdvancedBlur(false);
  assert.equal(dom.body.getAttribute('data-dct-advblur'), null, 'switching the ring off removes its marker');
  controller.setAdvancedBlur(true);
  assert.equal(dom.body.getAttribute('data-dct-advblur'), '', 'the ring switch brings the marker back');

  // Turning the wallpaper off takes the whole message layer down, whichever way
  // the switch is set.
  controller.setDecoration('wallpaper', false);
  assert.equal(dom.body.getAttribute('data-dct-material'), null, 'no panel blur without the wallpaper layer');
  controller.setDecoration('wallpaper', true);
  assert.equal(dom.body.getAttribute('data-dct-material'), 'gaussian', 'the switch state comes back');
});

test('a configuration exported by the card round-trips through the controller', async () => {
  const { spec } = loadBundle();
  const { React } = makeReact();
  const plugin = spec.factory(() => React);
  const { ctx, record } = makeContext();
  plugin.apply(ctx);
  record.injectFactory();
  const controller = record.slot.config.inject().controller;
  await new Promise(resolve => setTimeout(resolve, 0));

  controller.setColor('dark', 'accent', '#00FF00');
  controller.setCopy('greeting', '嗨');
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.palette.dark.accent, '#00ff00');
  assert.equal(snapshot.greeting, '嗨');

  // The token layer follows the customization.
  const latest = record.overrides[record.overrides.length - 1].tokens;
  assert.equal(latest['--dsw-alias-brand-primary'].dark, '#00ff00');

  controller.setColor('dark', 'accent', '');
  assert.equal(controller.getSnapshot().palette.dark.accent, '#8EDDD5');
});
