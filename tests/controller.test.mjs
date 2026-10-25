import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, STORAGE_KEY, CUSTOM_KEY } from '../src/controller.js';
import { PALETTES, PALETTE_KEYS, OVERRIDES, resolvePalettes } from '../src/palette.js';
import { buildExport, parseImport, parsePaletteImport, sanitizeText, sanitizePalette, sanitizeStickerNames, sanitizeModeNames, TEXT_LIMITS, NAME_LIMIT } from '../src/config.js';

function fixture(preference=null, custom=null) {
  const data=new Map();
  if (preference!==null) data.set(STORAGE_KEY,preference);
  if (custom!==null) data.set(CUSTOM_KEY,custom);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const layers=new Map(); let preferenceMode='system'; let scheme='light'; let releaseCount=0;
  const theme={getTheme:()=>({preference:preferenceMode,active:{colorScheme:scheme,tokens:{}}}),setTheme:mode=>{preferenceMode=mode;scheme=mode==='dark'?'dark':'light';},overrideTokens:(source,tokens)=>{const entry={tokens};layers.set(source,entry);return()=>{if(layers.get(source)===entry){layers.delete(source);releaseCount++;}};}};
  return {theme,storage,data,layers,get releaseCount(){return releaseCount;}};
}
// Minimal in-memory stand-in for the IndexedDB store.
function imageStore(initial={}) {
  const map=new Map(Object.entries(initial));
  return {map,async load(){return Object.fromEntries(map);},async write(key,blob){map.set(key,blob);},async remove(key){map.delete(key);},async clear(){map.clear();}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const source=()=>'dsh-custom-theme';
const layer=f=>f.layers.get(source()).tokens;

test('disabled preference survives a new window and restores native colors',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);c.choose('dark');c.choose('default');
  assert.equal(f.layers.size,0);assert.equal(c.getSnapshot().preference,'dark');c.dispose();
  const next=createController(f.theme,f.storage);assert.equal(next.getSnapshot().enabled,false);assert.equal(f.layers.size,0);
});
test('native theme changes update the card without removing the overlay',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);f.theme.setTheme('dark');c.syncTheme();
  assert.equal(c.getSnapshot().scheme,'dark');assert.equal(c.getSnapshot().preference,'dark');assert.equal(f.layers.size,1);
});
test('switching choices never leaves duplicate layers, disposal releases the last',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);for(const mode of ['light','dark','system','light'])c.choose(mode);
  assert.equal(f.layers.size,1);assert.equal(f.releaseCount,4);c.dispose();c.dispose();assert.equal(f.layers.size,0);assert.equal(f.releaseCount,5);
});
test('a cross-window disable removes the active layer',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);f.data.set(STORAGE_KEY,JSON.stringify({version:1,enabled:false}));c.syncStorage();
  assert.equal(c.getSnapshot().enabled,false);assert.equal(f.layers.size,0);
});
test('future settings are preserved even when a temporary choice is made',()=>{
  const raw=JSON.stringify({version:2,enabled:true,background:'future'});const f=fixture(raw);const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().enabled,false);c.choose('light');assert.equal(c.getSnapshot().storageState,'newer');assert.equal(f.data.get(STORAGE_KEY),raw);
});
test('storage write failures keep the current choice usable and report the limit',()=>{
  const f=fixture();f.storage.setItem=()=>{throw new Error('quota');};const c=createController(f.theme,f.storage);c.choose('dark');
  assert.equal(c.getSnapshot().enabled,true);assert.equal(c.getSnapshot().storageState,'unavailable');assert.equal(f.layers.size,1);
});
test('malformed boolean is not treated as enabled and can be repaired by choosing',()=>{
  const f=fixture('{"version":1,"enabled":"false"}');const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().enabled,false);c.choose('system');assert.deepEqual(JSON.parse(f.data.get(STORAGE_KEY)),{version:1,enabled:true,wallpaper:true,stickers:true,panelBlur:true,advancedBlur:true});
});
test('corrupted JSON restores default colors until the user chooses again',()=>{
  const f=fixture('{broken');const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().enabled,false);assert.equal(c.getSnapshot().storageState,'invalid');assert.equal(f.layers.size,0);
  c.choose('light');assert.equal(c.getSnapshot().storageState,'saved');assert.equal(f.layers.size,1);
});
test('disposed controller cannot write or notify',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);let events=0;c.subscribe(()=>events++);c.dispose();c.choose('dark');c.syncTheme();c.syncStorage();
  assert.equal(events,0);assert.equal(f.data.size,0);assert.equal(f.layers.size,0);
});
test('decoration toggles persist and old color-only settings migrate safely',()=>{
  const f=fixture('{"version":1,"enabled":true}');const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().wallpaper,true);c.setDecoration('wallpaper',false);c.setDecoration('stickers',false);c.dispose();
  const next=createController(f.theme,f.storage);assert.equal(next.getSnapshot().wallpaper,false);assert.equal(next.getSnapshot().stickers,false);
  assert.throws(()=>next.setDecoration('bad',true));
});
test('wallpaper mode relaxes the shell tokens and restores colors when turned off',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  assert.equal(layer(f)['--dsw-alias-bg-base'].light,'transparent');
  assert.equal(layer(f)['--dsw-specific-bubble'].light,'transparent');
  c.setDecoration('wallpaper',false);
  assert.equal(layer(f)['--dsw-alias-bg-base'].light,'#FAF8F2');
  assert.equal(layer(f)['--dsw-specific-bubble'].light,'#F2F8F7');
  c.choose('default');assert.equal(f.layers.size,0);
});

// ---- customization -------------------------------------------------------

test('every palette entry is editable and reaches the live token layer',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  assert.ok(PALETTE_KEYS.length>=19);
  for(const key of PALETTE_KEYS) assert.equal(c.setColor('light',key,'#123456'),true,key);
  const tokens=layer(f);
  assert.deepEqual(tokens['--dsw-alias-brand-primary'],{light:'#123456',dark:'#8EDDD5'});
  assert.deepEqual(tokens['--dsw-alias-bg-layer-1'],{light:'#123456',dark:'#1B3043'});
  assert.deepEqual(tokens['--dct-support1'],{light:'#123456',dark:'#E8ACB9'});
  // The pre-rename variable names stay defined for older stylesheets.
  assert.deepEqual(tokens['--dct-pink'],{light:'#123456',dark:'#E8ACB9'});
  assert.equal(c.getSnapshot().palette.light.accent,'#123456');
  assert.equal(c.getSnapshot().palette.dark.accent,'#8EDDD5');
});
test('color overrides persist, are normalized, and an empty value clears them',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  assert.equal(c.setColor('dark','accent','#AABBCC'),true);
  assert.equal(c.getSnapshot().palette.dark.accent,'#aabbcc');
  assert.equal(c.setColor('dark','accent','not-a-color'),false);
  assert.equal(c.getSnapshot().palette.dark.accent,'#aabbcc');
  assert.equal(c.setColor('dark','accent',''),true);
  assert.equal(c.getSnapshot().palette.dark.accent,'#8EDDD5');
  assert.deepEqual(c.getSnapshot().colors.dark,{});
  assert.throws(()=>c.setColor('sepia','accent','#123456'));
  assert.throws(()=>c.setColor('dark','nope','#123456'));

  c.setColor('light','support2','#010203');c.dispose();
  const next=createController(f.theme,f.storage);
  assert.equal(next.getSnapshot().colors.light.support2,'#010203');
  assert.equal(next.getSnapshot().palette.light.support2,'#010203');
  assert.equal(next.getSnapshot().palette.light.support3,PALETTES.light.support3);
});

// ---- auxiliary colors renamed to support1..3 ------------------------------

test('the old auxiliary color keys still resolve onto the renamed entries',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  // A stored record written before the rename.
  const legacy=fixture(null,JSON.stringify({version:1,palette:{light:{pink:'#112233',gold:'#445566',lilac:'#778899'}}}));
  const old=createController(legacy.theme,legacy.storage);
  assert.deepEqual(old.getSnapshot().colors.light,{support1:'#112233',support2:'#445566',support3:'#778899'});
  assert.equal(old.getSnapshot().palette.light.support1,'#112233');
  // A caller that still passes the old key.
  assert.equal(c.setColor('dark','lilac','#0a0b0c'),true);
  assert.equal(c.getSnapshot().colors.dark.support3,'#0a0b0c');
  assert.equal(c.setColor('dark','lilac',''),true);
  assert.deepEqual(c.getSnapshot().colors.dark,{});
  assert.throws(()=>c.setColor('dark','pink1','#123456'));
});
test('an old exported file imports its auxiliary colors under the new names',()=>{
  const parsed=parseImport(JSON.stringify({format:'dsh-custom-theme',version:1,palette:{light:{pink:'#AABBCC',accent:'#010203'}}}));
  assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.config.palette.light,{support1:'#aabbcc',accent:'#010203'});
});
test('a malformed auxiliary color under either name is still refused',()=>{
  assert.deepEqual(parseImport(JSON.stringify({format:'dsh-custom-theme',version:1,palette:{light:{pink:'red'}}})),{ok:false,reason:'importInvalid'});
  assert.deepEqual(parseImport(JSON.stringify({format:'dsh-custom-theme',version:1,palette:{light:{support1:'red'}}})),{ok:false,reason:'importInvalid'});
});
test('the chat-panel blur switch defaults to on, persists, folds legacy records and rejects nonsense',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().panelBlur,true);
  c.setPanelBlur(false);
  assert.equal(c.getSnapshot().panelBlur,false);
  assert.equal(JSON.parse(f.data.get(STORAGE_KEY)).panelBlur,false);
  assert.throws(()=>c.setPanelBlur('frosted'));
  // The advanced-blur switch rides along in the same record.
  assert.equal(c.getSnapshot().advancedBlur,true);
  c.setAdvancedBlur(false);
  assert.equal(c.getSnapshot().advancedBlur,false);
  assert.equal(JSON.parse(f.data.get(STORAGE_KEY)).advancedBlur,false);
  assert.throws(()=>c.setAdvancedBlur('wide'));
  c.dispose();
  const next=createController(f.theme,f.storage);
  assert.equal(next.getSnapshot().panelBlur,false);
  assert.equal(next.getSnapshot().advancedBlur,false);
  // A record from a build that never stored the choice falls back to the default.
  const fresh=fixture('{"version":1,"enabled":true}');
  assert.equal(createController(fresh.theme,fresh.storage).getSnapshot().panelBlur,true);
  assert.equal(createController(fresh.theme,fresh.storage).getSnapshot().advancedBlur,true);
  // Records written for the old two-way picker fold onto the switch: both of its
  // values meant an effect was switched on.
  const legacyLiquid=fixture('{"version":1,"enabled":true,"material":"liquid"}');
  assert.equal(createController(legacyLiquid.theme,legacyLiquid.storage).getSnapshot().panelBlur,true);
  const legacyGaussian=fixture('{"version":1,"enabled":true,"material":"gaussian"}');
  assert.equal(createController(legacyGaussian.theme,legacyGaussian.storage).getSnapshot().panelBlur,true);
  // A corrupted value is ignored rather than thrown at the card.
  const odd=fixture('{"version":1,"enabled":true,"material":"glass"}');
  assert.equal(createController(odd.theme,odd.storage).getSnapshot().panelBlur,true);
});
test('a corrupt customization record is dropped without disabling the theme',()=>{
  const f=fixture(null,'{broken');const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().enabled,true);
  assert.equal(c.getSnapshot().palette.light.accent,PALETTES.light.accent);
  assert.deepEqual(c.getSnapshot().colors,{light:{},dark:{}});
});
test('a future customization record is never overwritten',()=>{
  const raw=JSON.stringify({version:2,palette:{light:{accent:'#010203'}}});const f=fixture(null,raw);const c=createController(f.theme,f.storage);
  c.setColor('light','accent','#0f0f0f');
  assert.equal(f.data.get(CUSTOM_KEY),raw);
  assert.equal(c.getSnapshot().storageState,'newer');
});
test('custom copy persists, is sanitized, and resets to the built-in strings',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  c.setCopy('greeting','  你好   世界  ');
  c.setCopy('title','我的主题');
  c.setCopy('description','x'.repeat(TEXT_LIMITS.description+50));
  assert.equal(c.getSnapshot().greeting,'你好 世界');
  assert.equal(c.getSnapshot().title,'我的主题');
  assert.equal(c.getSnapshot().description.length,TEXT_LIMITS.description);
  assert.throws(()=>c.setCopy('nope','x'));
  c.dispose();
  const next=createController(f.theme,f.storage);
  assert.equal(next.getSnapshot().greeting,'你好 世界');
  next.resetCopy();
  assert.equal(next.getSnapshot().greeting,'');
  assert.equal(next.getSnapshot().title,'');
  assert.equal(next.getSnapshot().description,'');
});

// ---- images --------------------------------------------------------------

test('stored images load asynchronously and republish once ready',async()=>{
  const wallpaper={kind:'wallpaper'};const sticker={kind:'sticker'};
  const store=imageStore({wallpaper,'sticker:2':sticker});
  const f=fixture();const c=createController(f.theme,f.storage,{imageStore:store});
  assert.equal(c.getSnapshot().imageState,'loading');
  await tick();
  assert.equal(c.getSnapshot().imageState,'ready');
  assert.equal(c.getSnapshot().images.wallpaper,wallpaper);
  assert.equal(c.getSnapshot().images.stickers[2],sticker);
  assert.equal(c.getSnapshot().images.stickers[0],null);
  assert.equal(c.getSnapshot().images.stickers.length,6);
});
test('an unavailable image store is reported and never throws',async()=>{
  const store=imageStore();store.load=async()=>{throw new Error('blocked');};
  const f=fixture();const c=createController(f.theme,f.storage,{imageStore:store});
  await tick();
  assert.equal(c.getSnapshot().imageState,'unavailable');
  assert.equal(c.getSnapshot().enabled,true);
  assert.equal(f.layers.size,1);
});
test('replacing and clearing one image slot updates memory and the store',async()=>{
  const store=imageStore();const f=fixture();const c=createController(f.theme,f.storage,{imageStore:store});
  await tick();
  const blob={kind:'new'};
  assert.equal(await c.setImage('sticker',0,blob),true);
  assert.equal(store.map.get('sticker:0'),blob);
  assert.equal(c.getSnapshot().images.stickers[0],blob);
  assert.equal(await c.setImage('wallpaper',-1,blob),true);
  assert.equal(store.map.get('wallpaper'),blob);
  assert.equal(await c.setImage('wallpaper',-1,null),true);
  assert.equal(store.map.has('wallpaper'),false);
  assert.equal(c.getSnapshot().images.wallpaper,null);
  await assert.rejects(async()=>c.setImage('nope',0,blob));
});
test('without an image store the card reports that images cannot be saved',async()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().imageState,'unavailable');
  assert.equal(await c.setImage('sticker',0,{kind:'new'}),false);
  assert.equal(c.getSnapshot().notice,'imageUnavailable');
});

// ---- imported and exported configuration ---------------------------------

const WALLPAPER='data:image/png;base64,iVBORw0KGgo=';
const STICKER='data:image/webp;base64,UklGRg==';

test('export then import round-trips colors, copy, names and images',async()=>{
  const f=fixture();const store=imageStore();const c=createController(f.theme,f.storage,{imageStore:store});
  await tick();
  const wallpaperBlob={kind:'wallpaper'};const stickerBlob={kind:'sticker'};
  await c.setColor('light','accent','#123456');
  await c.setImage('wallpaper',-1,wallpaperBlob);
  await c.setImage('sticker',4,stickerBlob);
  c.setCopy('greeting','回来啦');
  c.setModeName('light','樱花白');
  c.setStickerName(0,'打招呼');

  const document_=buildExport({palette:c.getSnapshot().colors,title:c.getSnapshot().title,description:c.getSnapshot().description,greeting:c.getSnapshot().greeting,
    modeNames:c.getSnapshot().modeNames,stickerNames:c.getSnapshot().stickerNames,
    images:{wallpaper:WALLPAPER,stickers:[null,null,null,null,STICKER,null]}});
  assert.equal(document_.format,'dsh-custom-theme');
  assert.equal(document_.version,1);
  assert.deepEqual(document_.palette.light,{accent:'#123456'});
  assert.deepEqual(document_.modeNames,{light:'樱花白',dark:''});
  assert.equal(document_.stickerNames.length,6);
  assert.equal(document_.stickerNames[0],'打招呼');
  assert.equal(document_.images.wallpaper,WALLPAPER);
  assert.equal(document_.images.stickers.length,6);

  const target=imageStore({'sticker:1':{stale:true}});
  const g=fixture();const next=createController(g.theme,g.storage,{imageStore:target});
  await tick();
  const parsed=parseImport(JSON.stringify(document_));
  assert.equal(parsed.ok,true);
  assert.equal(await next.applyConfig(parsed.config,{wallpaper:wallpaperBlob,stickers:[null,null,null,null,stickerBlob,null]}),true);
  assert.equal(next.getSnapshot().palette.light.accent,'#123456');
  assert.equal(next.getSnapshot().greeting,'回来啦');
  assert.equal(next.getSnapshot().modeNames.light,'樱花白');
  assert.equal(next.getSnapshot().stickerNames[0],'打招呼');
  assert.equal(next.getSnapshot().images.wallpaper,wallpaperBlob);
  assert.equal(next.getSnapshot().images.stickers[4],stickerBlob);
  assert.equal(next.getSnapshot().images.stickers[1],null);
  assert.equal(target.map.has('sticker:1'),false);
  assert.equal(target.map.get('wallpaper'),wallpaperBlob);
  assert.deepEqual(JSON.parse(g.data.get(CUSTOM_KEY)).palette.light,{accent:'#123456'});
  assert.deepEqual(JSON.parse(g.data.get(CUSTOM_KEY)).stickerNames[0],'打招呼');
});
test('a file without names imports with empty names',()=>{
  const parsed=parseImport(JSON.stringify({format:'dsh-custom-theme',version:1,title:'只有标题',palette:{light:{accent:'#010203'}}}));
  assert.equal(parsed.ok,true);
  assert.equal(parsed.config.title,'只有标题');
  assert.deepEqual(parsed.config.modeNames,{light:'',dark:''});
  assert.deepEqual(parsed.config.stickerNames,['','','','','','']);
});
test('import validation refuses foreign, newer, malformed and oversized files',()=>{
  const bad=[
    ['', 'importInvalid'],
    ['not json', 'importInvalid'],
    ['[]', 'importInvalid'],
    [JSON.stringify({format:'other',version:1}), 'importInvalid'],
    [JSON.stringify({format:'dsh-custom-theme',version:2}), 'importVersion'],
    [JSON.stringify({format:'dsh-custom-theme',version:1,palette:{light:{accent:'red'}}}), 'importInvalid'],
    [JSON.stringify({format:'dsh-custom-theme',version:1,images:{wallpaper:'data:text/plain;base64,QQ=='}}), 'importImageInvalid'],
    [JSON.stringify({format:'dsh-custom-theme',version:1,images:{stickers:['data:image/png;base64,'+'A'.repeat(4000000)]}}), 'importImageInvalid']
  ];
  for(const [text,reason] of bad) assert.deepEqual(parseImport(text),{ok:false,reason},text.slice(0,40));
  const good=parseImport(JSON.stringify({format:'dsh-custom-theme',version:1,title:'  名字  ',palette:{light:{accent:'#AABBCC',unknown:'#000000'}},
    modeNames:{light:'浅',dark:5},stickerNames:['一','二','三']}));
  assert.equal(good.ok,true);
  assert.equal(good.config.title,'名字');
  assert.deepEqual(good.config.palette.light,{accent:'#aabbcc'});
  assert.deepEqual(good.config.modeNames,{light:'浅',dark:''});
  assert.deepEqual(good.config.stickerNames,['一','二','三','','','']);
  assert.equal(good.config.images.stickers.length,6);
});
test('a configuration whose images cannot be stored still applies colors and copy',async()=>{
  const f=fixture();f.storage.setItem=()=>{throw new Error('quota');};
  const c=createController(f.theme,f.storage);
  const parsed=parseImport(JSON.stringify({format:'dsh-custom-theme',version:1,title:'名字',palette:{dark:{accent:'#0f0f0f'}},images:{wallpaper:WALLPAPER}}));
  assert.equal(await c.applyConfig(parsed.config,{wallpaper:{kind:'wallpaper'},stickers:[]}),false);
  assert.equal(c.getSnapshot().palette.dark.accent,'#0f0f0f');
  assert.equal(c.getSnapshot().title,'名字');
  assert.equal(c.getSnapshot().images.wallpaper,null);
  assert.equal(c.getSnapshot().notice,'imageFailed');
  assert.equal(c.getSnapshot().storageState,'unavailable');
});
test('resetAll clears colors, copy and stored images',async()=>{
  const store=imageStore({wallpaper:{kind:'wallpaper'},'sticker:0':{kind:'sticker'}});
  const f=fixture();const c=createController(f.theme,f.storage,{imageStore:store});
  await tick();
  c.setColor('light','accent','#123456');c.setCopy('greeting','你好');
  await c.resetAll();
  assert.deepEqual(c.getSnapshot().colors,{light:{},dark:{}});
  assert.equal(c.getSnapshot().palette.light.accent,PALETTES.light.accent);
  assert.equal(c.getSnapshot().greeting,'');
  assert.equal(c.getSnapshot().images.wallpaper,null);
  assert.equal(c.getSnapshot().images.stickers[0],null);
  assert.equal(store.map.size,0);
});
test('resetColors clears one mode at a time',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  c.setColor('light','accent','#111111');c.setColor('dark','accent','#222222');
  c.resetColors('light');
  assert.deepEqual(c.getSnapshot().colors.light,{});
  assert.equal(c.getSnapshot().colors.dark.accent,'#222222');
  c.resetColors();
  assert.deepEqual(c.getSnapshot().colors,{light:{},dark:{}});
});

// ---- custom names --------------------------------------------------------

test('appearance names persist, sanitize, cap and fall back when cleared',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  assert.deepEqual(c.getSnapshot().modeNames,{light:'',dark:''});
  c.setModeName('light','  樱花   白 ');
  c.setModeName('dark','x'.repeat(NAME_LIMIT+10));
  assert.equal(c.getSnapshot().modeNames.light,'樱花 白');
  assert.equal(c.getSnapshot().modeNames.dark.length,NAME_LIMIT);
  assert.throws(()=>c.setModeName('sepia','虎斑'));
  c.dispose();

  const next=createController(f.theme,f.storage);
  assert.equal(next.getSnapshot().modeNames.light,'樱花 白');
  next.setModeName('light','');
  assert.equal(next.getSnapshot().modeNames.light,'');
  next.resetCopy();
  assert.deepEqual(next.getSnapshot().modeNames,{light:'',dark:''});
});
test('sticker names persist per slot and only accept real slots',()=>{
  const f=fixture();const c=createController(f.theme,f.storage);
  assert.deepEqual([...c.getSnapshot().stickerNames],['','','','','','']);
  c.setStickerName(0,'打招呼');
  c.setStickerName(5,' 比心 ');
  assert.deepEqual([...c.getSnapshot().stickerNames],['打招呼','','','','','比心']);
  assert.throws(()=>c.setStickerName(6,'越界'));
  assert.throws(()=>c.setStickerName(-1,'越界'));
  assert.throws(()=>c.setStickerName('0','越界'));
  c.dispose();

  const next=createController(f.theme,f.storage);
  assert.equal(next.getSnapshot().stickerNames[5],'比心');
  next.setStickerName(5,'');
  assert.equal(next.getSnapshot().stickerNames[5],'');
  next.setStickerName(2,'读书吧');
  next.resetAll();
  assert.deepEqual([...next.getSnapshot().stickerNames],['','','','','','']);
});

test('an unreadable storage layer reports it and keeps the built-in look',()=>{
  const f=fixture();f.storage.getItem=()=>{throw new Error('blocked');};f.storage.setItem=()=>{throw new Error('blocked');};
  const c=createController(f.theme,f.storage);
  assert.equal(c.getSnapshot().storageState,'unavailable');
  assert.equal(c.getSnapshot().enabled,true);
});

// ---- palette invariants --------------------------------------------------

test('text sanitizing collapses whitespace and caps length',()=>{
  assert.equal(sanitizeText('  a\n\tb  ',50),'a b');
  assert.equal(sanitizeText(null,50),'');
  assert.equal(sanitizeText('abcdef',3),'abc');
  assert.deepEqual(sanitizePalette({light:{accent:'#AABBCC',bad:'nope'},dark:null}),{light:{accent:'#aabbcc'},dark:{}});
  assert.deepEqual(sanitizeModeNames({light:' 浅 ',dark:7}),{light:'浅',dark:''});
  assert.deepEqual(sanitizeStickerNames([' 一 ',null,'三']),['一','','三','','','']);
  assert.equal(sanitizeModeNames({light:'x'.repeat(NAME_LIMIT+5)}).light.length,NAME_LIMIT);
});
test('resolvePalettes ignores invalid overrides',()=>{
  const resolved=resolvePalettes({light:{accent:'#010203',nope:'#ffffff'},dark:{accent:'rgb(1,2,3)'}});
  assert.equal(resolved.light.accent,'#010203');
  assert.equal(resolved.light.nope,undefined);
  assert.equal(resolved.dark.accent,PALETTES.dark.accent);
  assert.equal(resolved.light.base,PALETTES.light.base);
});
function luminance(hex){const channels=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
function contrast(a,b){const aa=luminance(a),bb=luminance(b);return(Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05);}
test('body, secondary text, code, and active button text retain 4.5:1 contrast',()=>{
  for(const [mode,p]of Object.entries(PALETTES))for(const [fg,bg]of [['text','base'],['text','sidebar'],['text','surface'],['text','code'],['secondary','base'],['secondary','sidebar'],['muted','base'],['onAccent','accent'],['onAccent','accentHover']])assert.ok(contrast(p[fg],p[bg])>=4.5,`${mode} ${fg}/${bg}: ${contrast(p[fg],p[bg])}`);
});
test('every shipped palette exposes the same editable keys',()=>{
  assert.deepEqual(Object.keys(PALETTES.light),Object.keys(PALETTES.dark));
  assert.deepEqual([...PALETTE_KEYS],Object.keys(PALETTES.light));
});
test('semantic danger/success/warning/diff colors are not reclassified',()=>{
  assert.ok(Object.keys(OVERRIDES).length>50);
  for(const name of Object.keys(OVERRIDES))assert.doesNotMatch(name,/state-(error|warn|success)|diff-(added|deleted)/);
});

test('a colours-only patch merges colours and leaves copy, names and images alone', () => {
  const f = fixture();
  const c = createController(f.theme, f.storage, { imageStore: imageStore() });
  c.setCopy('title', '我的主题');
  c.setCopy('greeting', '你好');
  c.setStickerName(0, '第一张');
  const ok = c.applyPalette({ light: { accent: '#112233' }, dark: { base: '#101820' } });
  assert.equal(ok, true);
  const s = c.getSnapshot();
  assert.equal(s.palette.light.accent, '#112233');
  assert.equal(s.palette.dark.base, '#101820');
  assert.equal(s.palette.light.text, PALETTES.light.text);
  assert.equal(s.title, '我的主题');
  assert.equal(s.greeting, '你好');
  assert.equal(s.stickerNames[0], '第一张');
  assert.equal(s.images.wallpaper, null);
  c.dispose();
});

test('a colours-only patch that changes nothing reports no change', () => {
  const f = fixture();
  const c = createController(f.theme, f.storage);
  assert.equal(c.applyPalette({ light: {} }), false);
  assert.equal(c.applyPalette({ light: { accent: PALETTES.light.accent } }), false);
  c.dispose();
});

test('parsePaletteImport takes bare and enveloped colour files only', () => {
  const bare = parsePaletteImport(JSON.stringify({ light: { accent: '#112233' }, dark: {} }));
  assert.equal(bare.ok, true);
  assert.equal(bare.palette.light.accent, '#112233');
  const enveloped = parsePaletteImport(JSON.stringify({ format: 'dsh-custom-theme', version: 1, palette: { light: { accent: '#112233' } } }));
  assert.equal(enveloped.ok, true);
  assert.equal(parsePaletteImport(JSON.stringify({ format: 'dsh-custom-theme', version: 2, palette: { light: { accent: '#112233' } } })).reason, 'importVersion');
  assert.equal(parsePaletteImport(JSON.stringify({ palette: { light: { accent: 'nope' } } })).reason, 'importInvalid');
  assert.equal(parsePaletteImport(JSON.stringify({ palette: { light: { accent: '#112233' } }, images: { wallpaper: null, stickers: [] } })).reason, 'importInvalid');
  assert.equal(parsePaletteImport(JSON.stringify({ palette: { light: { accent: '#112233' } }, title: 'x' })).reason, 'importInvalid');
  assert.equal(parsePaletteImport(JSON.stringify({ palette: { light: {} } })).reason, 'importInvalid');
});

