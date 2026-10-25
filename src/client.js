import { PALETTE_KEYS, SUPPORT_KEYS } from './palette.js';
import { createController, STORAGE_KEY } from './controller.js';
import { artCss, installHeroCopy, installButtonPreviews } from './art.js';
import { gaussianGlassCss, createPanelBlurManager, pageEffectCss } from './glass.js';
import { buildExport, parseImport, parsePaletteImport, STICKER_SLOTS, MODE_KEYS, NAME_LIMIT } from './config.js';
import { createIndexedImageStore, normalizeImage, blobToDataUrl, dataUrlToBlob, downloadText } from './image-store.js';

export const inject = ['theme', 'slots', 'locale'];

/** Shipped greeting; replaced whenever the user sets their own. */
/** Home page of the project this plugin is derived from; credited in the card. */
export const UPSTREAM_URL = 'https://github.com/Mahiru0427/dsh-vesna-theme';
/** This plugin's own home page, linked from the settings card. */
export const PROJECT_URL = 'https://github.com/km5473/dsh-customizable-theme';

/** Shipped greeting; replaced whenever the user sets their own. */
export const DEFAULT_GREETING = '找我什么事呀，亲爱的朋友~';

export const dictionaries = {
  zh: { title:'薇斯纳主题', description:'青蓝与奶白，点缀珊瑚粉和淡金。', default:'默认配色', light:'春日浅色', dark:'夜宴深色', system:'跟随系统', activeLight:'当前为浅色', activeDark:'当前为深色', inactive:'已恢复默认配色', saved:'选择已保存', unavailable:'当前选择仅在本次打开期间生效，无法保存到本机。', newer:'已有较新版本的设置，本版不会覆盖；当前切换仅临时生效。', invalid:'保存的设置无法识别，已恢复默认；重新选择即可保存。', palette:'主题配色', colorTeal:'青蓝', colorWhite:'奶白', colorNavy:'深蓝' },
  en: { title:'Vesna theme', description:'Teal and ivory with coral pink and soft gold.', default:'Default colors', light:'Spring light', dark:'Evening dark', system:'Follow system', activeLight:'Light appearance', activeDark:'Dark appearance', inactive:'Default colors restored', saved:'Selection saved', unavailable:'This selection lasts for this window only. Local saving is unavailable.', newer:'Newer settings were found and will be preserved. Changes are temporary.', invalid:'Saved settings were not recognized. Choose an appearance to save again.', palette:'Theme palette', colorTeal:'Teal', colorWhite:'Ivory', colorNavy:'Navy' }
};
Object.assign(dictionaries.zh, { importedColours:'配色已应用，壁纸与文案未改动。', importedColoursSame:'这组配色与当前一致，未做改动。' });
Object.assign(dictionaries.en, { importedColours:'Colours applied. Wallpaper and copy untouched.', importedColoursSame:'These colours are already applied.' });
Object.assign(dictionaries.zh, {material:'聊天框效果',materialNote:'高斯模糊会让消息面板略微磨砂。打开「高级模糊」会在输入卡外圈再套一层更宽的模糊边框。',advancedBlur:'高级模糊',gaussian:'高斯模糊',wallpaper:'全窗口壁纸',stickers:'日常按钮表情',artNote:'侧栏与顶部采用模糊玻璃效果。表情用于新会话、主页欢迎区和发送按钮；功能文字保留。',greeting:'你好呀',thinking:'思考中',reading:'认真看书',confused:'有点迷糊',good:'做得不错',heart:'送你一颗心',customColors:'配色自定义',customCopy:'文案与名称',customImages:'图片与表情',customHint:'下面的改动只保存在本机，可随时导出成配置文件。',resetGroup:'恢复本组默认',resetOne:'清除这一项',resetAll:'恢复默认配置',themeName:'主题名称',themeDesc:'主题描述',greetingLabel:'欢迎语',lightName:'浅色名称',darkName:'深色名称',stickerName:'表情名称',colorHex:'十六进制颜色',choose:'选择图片',restore:'恢复默认',resetImages:'全部恢复默认图片',exportConfig:'导出配置',importConfig:'导入配置',exported:'配置已导出。',imported:'配置已导入。',importInvalid:'配置文件无法识别，未做任何更改。',importVersion:'配置文件版本不匹配，未做任何更改。',importImageInvalid:'配置文件里的图片无法使用，未做任何更改。',importFailed:'配置文件读取失败，未做任何更改。',exportFailed:'配置导出失败。',imageFailed:'图片保存失败，请重试。',imageTooLarge:'图片太大，请换一张更小的图片。',imageUnavailable:'当前环境无法保存图片，本次选择只临时生效。',imageNote:'图片保存在本机浏览器里，不会上传。',credit:'© 2026 km5473 · MIT 许可',homepage:'项目主页',basedOn:'基于 dsh-vesna-theme',color_base:'基底',color_surface:'卡片面',color_sidebar:'侧栏',color_raised:'浮起面',color_elevated:'高层浮层',color_text:'正文',color_secondary:'次要文字',color_tertiary:'三级文字',color_muted:'弱化文字',color_accent:'强调色',color_accentHover:'强调悬停',color_accentSoft:'强调浅底',color_onAccent:'强调文字',color_border:'边框',color_hover:'悬停底',color_code:'代码底',color_support1:'辅助色1',color_support2:'辅助色2',color_support3:'辅助色3'});
Object.assign(dictionaries.en, {material:'Message appearance',materialNote:'Gaussian blur frosts the message panels slightly. Advanced blur wraps a wider blur ring around the input card.',advancedBlur:'Advanced blur',gaussian:'Gaussian blur',wallpaper:'Full-window wallpaper',stickers:'Chibi stickers',artNote:'Wallpaper shading follows appearance. Turn it off to keep colors only.',greeting:'Hello',thinking:'Thinking',reading:'Reading',confused:'Confused',good:'Well done',heart:'A heart for you',customColors:'Custom colors',customCopy:'Text and names',customImages:'Images and stickers',customHint:'Changes stay on this machine and can be exported as a configuration file.',resetGroup:'Reset this group',resetOne:'Clear this entry',resetAll:'Reset all customization',themeName:'Theme name',themeDesc:'Theme description',greetingLabel:'Greeting',lightName:'Light name',darkName:'Dark name',stickerName:'Sticker name',colorHex:'Hex color',choose:'Choose image',restore:'Restore default',resetImages:'Restore all images',exportConfig:'Export config',importConfig:'Import config',exported:'Configuration exported.',imported:'Configuration imported.',importInvalid:'That file was not recognized. Nothing changed.',importVersion:'That file has a different version. Nothing changed.',importImageInvalid:'The images in that file are unusable. Nothing changed.',importFailed:'That file could not be read. Nothing changed.',exportFailed:'The configuration could not be exported.',imageFailed:'The image could not be saved. Try again.',imageTooLarge:'That image is too large. Choose a smaller one.',imageUnavailable:'Images cannot be saved here, so this choice lasts for this window only.',imageNote:'Images stay in this browser and are never uploaded.',credit:'© 2026 km5473 · MIT licence',homepage:'Project page',basedOn:'based on dsh-vesna-theme',color_base:'Base',color_surface:'Card surface',color_sidebar:'Sidebar',color_raised:'Raised',color_elevated:'Elevated',color_text:'Body text',color_secondary:'Secondary text',color_tertiary:'Tertiary text',color_muted:'Dimmed text',color_accent:'Accent',color_accentHover:'Accent hover',color_accentSoft:'Accent soft',color_onAccent:'On accent',color_border:'Border',color_hover:'Hover fill',color_code:'Code fill',color_support1:'Secondary 1',color_support2:'Secondary 2',color_support3:'Secondary 3'});

Object.assign(dictionaries.zh, {aiPalette:'AI 生成配色',aiIntro:'传一张角色立绘：全身或半身、背景干净，能看清头发、服装和饰物。图片只用于这次生成，不会保存成壁纸。',aiImage:'角色立绘',aiChooseImage:'选择图片',aiRemoveImage:'移除图片',aiImageNote:'图片只进入聊天框，不会保存为壁纸。',aiPrompt:'提示词',aiGuidance:'补充指导（可选）',aiGuidanceHint:'会追加到提示词末尾，例如：主色用粉色、不要紫色、更活泼。',aiGuidancePlaceholder:'例如：主色希望是粉色；不要紫色；整体更活泼一点。',aiNewChat:'请新建对话',aiNewChatHint:'先新开一个对话，再点「填入聊天框」；避免旧上下文影响配色。',aiFillChat:'填入聊天框',aiFilled:'已填入聊天框；关闭设置后发送。',aiFillFailed:'写不进聊天框，请手动复制提示词。',aiNeedImage:'先选一张角色立绘。',aiReply:'粘贴 AI 回复',aiReplyHint:'把模型返回的 JSON 粘到这里；也可以直接粘完整回复。',aiParse:'解析并填入',aiParsed:'已解析，颜色列表已更新。',aiParseFailed:'没识别到完整的 19 个颜色，检查 JSON 是否齐全。',aiParseMissing:'缺少这些颜色：',aiDownload:'不消耗 Token？下载提示词给豆包 / 千问',aiDownloaded:'提示词已下载。',aiPreview:'效果图',aiApply:'应用配色',aiApplied:'AI 配色已应用。',aiAppliedSame:'这组配色与当前一致。',aiReset:'恢复当前配色',aiClose:'关闭',aiLight:'浅色',aiDark:'深色',aiColorNote:'每个颜色可点色块取色，也可以直接改 hex。',aiPromptNote:'预填的是精简版；别删掉 19 个 token 和用途说明。'});
Object.assign(dictionaries.en, {aiPalette:'AI palette',aiIntro:'Use a character artwork: full or half body, clean background, visible hair, outfit and ornaments. The image is only used for this generation and never saved as wallpaper.',aiImage:'Character artwork',aiChooseImage:'Choose image',aiRemoveImage:'Remove image',aiImageNote:'The image only goes to the chat box; it is never saved as wallpaper.',aiPrompt:'Prompt',aiGuidance:'Extra guidance (optional)',aiGuidanceHint:'Appended to the prompt, e.g. make pink the main colour, avoid purple, keep it lively.',aiGuidancePlaceholder:'e.g. I want pink as the main colour; no purple; make it livelier.',aiNewChat:'Start a new conversation',aiNewChatHint:'Open a new chat before filling the composer, so old context does not affect the palette.',aiFillChat:'Fill chat box',aiFilled:'Filled the chat box; close settings and send.',aiFillFailed:'Could not write to the chat box. Copy the prompt manually.',aiNeedImage:'Choose a character artwork first.',aiReply:'Paste AI reply',aiReplyHint:'Paste the JSON the model returned, or the whole reply.',aiParse:'Parse and fill',aiParsed:'Parsed. The colour grid is updated.',aiParseFailed:'No complete 19-colour palette found. Check the JSON.',aiParseMissing:'Missing colours: ',aiDownload:'Rather not spend tokens? Download the prompt for Doubao / Qwen.',aiDownloaded:'Prompt downloaded.',aiPreview:'Preview',aiApply:'Apply colours',aiApplied:'AI colours applied.',aiAppliedSame:'These colours are already applied.',aiReset:'Restore current colours',aiClose:'Close',aiLight:'Light',aiDark:'Dark',aiColorNote:'Click a swatch to pick a colour, or edit the hex.',aiPromptNote:'The compact prompt is prefilled; keep the 19 tokens and the role notes.'});

const MODES = ['default', 'light', 'dark', 'system'];
const MODE_STICKER = { default:3, light:0, dark:2, system:1 };
const STICKER_NAMES = ['greeting', 'thinking', 'reading', 'confused', 'good', 'heart'];
const SWATCHES = [['accent','colorTeal'], ['base','colorWhite'], ['text','colorNavy'], ['support1','color_support1'], ['support2','color_support2']];
const COPY_FIELDS = [['title','themeName'], ['description','themeDesc'], ['greeting','greetingLabel']];
/** `#rrggbb`, with the leading `#` optional so a pasted code is accepted. */
const HEX_INPUT = /^#?[0-9a-fA-F]{6}$/;

/** Filesystem-safe timestamp suffix for the exported file name. */
function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** The Settings → General card: appearance, decoration toggles, hex color
 * editing, copy and name editing, image replacement and configuration
 * import/export.
 * @param React - the module-table React.
 * @param art - live artwork accessors shared with the wallpaper presenter.
 * @returns the React component registered into the settings slot.
 */
export function makeCard(React, art, chat) {
  const h = React.createElement;
  const useState = React.useState;
  const useRef = React.useRef;
  const useEffect = React.useEffect;
  const useSyncExternalStore = React.useSyncExternalStore;

  /** One palette entry: a swatch, an editable hex field and a clear button.
   * The text stays local while it is not yet a valid color, so typing is never
   * fought by the committed value; blur or Enter puts an invalid draft back. */
  function ColorField({ label, modeLabel, resetLabel, value, overridden, onCommit, onClear }) {
    const [draft, setDraft] = useState(value);
    const [synced, setSynced] = useState(value);
    if (value !== synced) { setSynced(value); setDraft(value); }
    const usable = HEX_INPUT.test(String(draft).trim());
    const settle = () => { if (HEX_INPUT.test(String(draft).trim())) onCommit(draft); else setDraft(value); };
    return h('label', { className:'dct-color-field' + (overridden ? ' is-overridden' : ''), title:label + ' · ' + value },
      h('span', { className:'dct-color-swatch', style:{ background:value }, 'aria-hidden':true }),
      h('input', {
        type:'text', className:'dct-color-hex' + (usable ? '' : ' is-invalid'), value:draft, maxLength:7,
        spellCheck:false, autoComplete:'off', 'aria-label':label + ' · ' + modeLabel + ' · #rrggbb',
        onChange:event => { const raw = event.target.value; setDraft(raw); if (HEX_INPUT.test(raw.trim())) onCommit(raw); },
        onBlur:settle,
        onKeyDown:event => { if (event.key === 'Enter') { event.preventDefault(); settle(); } }
      }),
      h('span', { className:'dct-color-name' }, label),
      overridden ? h('button', { type:'button', className:'dct-color-reset', 'aria-label':resetLabel, title:resetLabel, onClick:onClear }, '↺') : null);
  }

  /** One compact colour row: native picker + label + hex field. */
  function AiColorField({ label, value, onChange }) {
    const [draft, setDraft] = useState(value);
    const [synced, setSynced] = useState(value);
    if (value !== synced) { setSynced(value); setDraft(value); }
    return h('label', { className:'dct-ai-color', title:label + ' · ' + value },
      h('input', {
        type:'color', value, className:'dct-ai-picker', 'aria-label':label,
        onChange:event => onChange(event.target.value)
      }),
      h('span', { className:'dct-ai-color-name' }, label),
      h('input', {
        type:'text', className:'dct-ai-hex', value:draft, maxLength:7, spellCheck:false, autoComplete:'off',
        'aria-label':label + ' · #rrggbb',
        onChange:event => {
          const raw = event.target.value;
          setDraft(raw);
          const next = normalizeColor(raw);
          if (next) onChange(next);
        },
        onBlur:() => { if (!normalizeColor(draft)) setDraft(value); },
        onKeyDown:event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const next = normalizeColor(draft);
          if (next) onChange(next); else setDraft(value);
        }
      })
    );
  }

  /** The AI palette dialog: artwork, compact prompt, extra guidance, editable
   * light/dark tokens, a schematic preview and the paste-back parser. */
  function AiPaletteDialog({ controller, t, chat, initialPalette, onClose }) {
    const clone = palette => ({ light:{ ...palette.light }, dark:{ ...palette.dark } });
    const [draft, setDraft] = useState(() => clone(initialPalette));
    const [image, setImage] = useState(null);
    const [imageUrl, setImageUrl] = useState('');
    const [prompt, setPrompt] = useState(AI_PLUGIN_PROMPT);
    const [guidance, setGuidance] = useState('');
    const [reply, setReply] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      const onKey = event => { if (event.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

    const pickImage = async event => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      setError('');
      try {
        const blob = await normalizeImage(file, 'wallpaper');
        const named = new File([blob], 'ai-palette-source.webp', { type:blob.type || 'image/webp' });
        setImage(named);
        setImageUrl(URL.createObjectURL(named));
      } catch (failure) {
        setError(t(failure && failure.code === 'imageTooLarge' ? 'imageTooLarge' : 'imageFailed'));
      }
    };

    const removeImage = () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImage(null); setImageUrl('');
    };

    const composePrompt = () => {
      const extra = guidance.trim();
      return extra ? prompt + '\n\n补充要求：\n' + extra : prompt;
    };

    const fillChat = async () => {
      if (!image) { setError(t('aiNeedImage')); return; }
      if (!chat || typeof chat.fill !== 'function') { setError(t('aiFillFailed')); return; }
      setBusy(true); setError(''); setStatus('');
      try {
        const result = await chat.fill(composePrompt(), image);
        if (!result || result.ok !== true) { setError(t('aiFillFailed')); return; }
        controller.notify('aiFilled');
        onClose();
      } finally { setBusy(false); }
    };

    const parseReply = () => {
      const result = parsePaletteReply(reply);
      if (!result.ok) {
        setStatus('');
        if (result.reason === 'missing' && result.missing) {
          setError(t('aiParseMissing') + result.missing.slice(0, 6).join(', ') + (result.missing.length > 6 ? '…' : ''));
        } else setError(t('aiParseFailed'));
        return;
      }
      setDraft(result.palette);
      setError('');
      setStatus(t('aiParsed'));
    };

    const downloadPrompt = () => {
      const extra = guidance.trim();
      const body = extra ? AI_EXTERNAL_PROMPT + '\n\n## 我的补充要求\n' + extra : AI_EXTERNAL_PROMPT;
      const blob = new Blob([body], { type:'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = AI_PROMPT_FILENAME; anchor.rel = 'noopener';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus(t('aiDownloaded'));
    };

    const apply = () => {
      const changed = controller.applyPalette(draft);
      controller.notify(changed ? 'aiApplied' : 'aiAppliedSame');
      onClose();
    };

    const update = (mode, key, value) => setDraft(current => ({ ...current, [mode]:{ ...current[mode], [key]:value } }));

    const modeBlock = mode => h('div', { className:'dct-ai-mode', key:mode },
      h('div', { className:'dct-ai-mode-head' },
        h('span', null, t(mode === 'light' ? 'aiLight' : 'aiDark')),
        h('span', { className:'dct-ai-mode-count' }, '19')),
      h('div', { className:'dct-ai-rows' }, PALETTE_KEYS.map(key => h(AiColorField, {
        key, label:t('color_' + key), value:draft[mode][key],
        onChange:value => update(mode, key, value)
      }))));

    const preview = mode => {
      const p = draft[mode];
      return h('div', { className:'dct-ai-preview-wrap', key:mode },
        h('span', { className:'dct-ai-preview-label' }, t(mode === 'light' ? 'aiLight' : 'aiDark')),
        h('div', { className:'dct-ai-preview', style:{ background:p.base, borderColor:p.border, color:p.text } },
          h('div', { className:'dct-ai-preview-rail', style:{ background:p.sidebar } },
            h('span', { style:{ background:p.accentSoft } }),
            h('span', { style:{ background:p.raised } }),
            h('span', { style:{ background:p.raised } })),
          h('div', { className:'dct-ai-preview-body' },
            h('div', { className:'dct-ai-preview-card', style:{ background:p.surface, borderColor:p.border } },
              h('span', { style:{ background:p.secondary } }),
              h('span', { style:{ background:p.tertiary, opacity:0.82 } }),
              h('span', { style:{ background:p.muted, width:'46%' } })),
            h('div', { className:'dct-ai-preview-actions' },
              h('span', { className:'dct-ai-preview-code', style:{ background:p.code, color:p.tertiary } }, '{ }'),
              h('span', { className:'dct-ai-preview-button', style:{ background:p.accent, color:p.onAccent } }, 'Aa')),
            h('div', { className:'dct-ai-preview-dots' }, ['support1', 'support2', 'support3'].map(key => h('span', { key, style:{ background:p[key] } }))))));
    };

    return h('div', {
      className:'dct-ai-overlay', role:'presentation',
      onMouseDown:event => { if (event.target === event.currentTarget) onClose(); }
    },
      h('div', { className:'dct-ai-dialog', role:'dialog', 'aria-modal':'true', 'aria-label':t('aiPalette') },
        h('div', { className:'dct-ai-scroll' },
        h('div', { className:'dct-ai-head' },
          h('div', null,
            h('h3', null, t('aiPalette')),
            h('p', null, t('aiIntro'))),
          h('button', { type:'button', className:'dct-ai-close', 'aria-label':t('aiClose'), onClick:onClose },
            h('svg', { width:14, height:14, viewBox:'0 0 14 14', 'aria-hidden':true, focusable:'false' },
              h('path', { d:'M2.5 2.5l9 9M11.5 2.5l-9 9', fill:'none', stroke:'currentColor', strokeWidth:1.6, strokeLinecap:'round' })))),

        h('div', { className:'dct-ai-section' },
          h('div', { className:'dct-ai-image-row' },
            imageUrl
              ? h('img', { className:'dct-ai-thumb', src:imageUrl, alt:'', decoding:'async' })
              : h('div', { className:'dct-ai-thumb is-empty', 'aria-hidden':true }, '✧'),
            h('div', { className:'dct-ai-image-actions' },
              h('label', { className:'dct-action' }, t('aiChooseImage'),
                h('input', { type:'file', accept:'image/*', onChange:pickImage })),
              image ? h('button', { type:'button', className:'dct-mini', onClick:removeImage }, t('aiRemoveImage')) : null,
              h('p', { className:'dct-ai-hint' }, t('aiImageNote'))))),

        h('div', { className:'dct-ai-section' },
          h('div', { className:'dct-ai-section-head' },
            h('h4', null, t('aiPrompt')),
            h('span', null, t('aiPromptNote'))),
          h('textarea', {
            className:'dct-ai-textarea', rows:9, value:prompt, spellCheck:false,
            onChange:event => setPrompt(event.target.value), 'aria-label':t('aiPrompt')
          }),
          h('div', { className:'dct-ai-guidance' },
            h('div', { className:'dct-ai-guidance-head' },
              h('span', null, t('aiGuidance')),
              h('span', { className:'dct-ai-hint' }, t('aiGuidanceHint'))),
            h('textarea', {
              className:'dct-ai-textarea is-guidance', rows:3, value:guidance, spellCheck:false,
              placeholder:t('aiGuidancePlaceholder'),
              onChange:event => setGuidance(event.target.value), 'aria-label':t('aiGuidance')
            })),
          h('div', { className:'dct-ai-newchat' },
            h('strong', null, t('aiNewChat')),
            h('span', null, t('aiNewChatHint'))),
          h('div', { className:'dct-ai-row-actions' },
            h('button', { type:'button', className:'dct-ai-primary', disabled:busy, onClick:fillChat }, t('aiFillChat')))),

        h('div', { className:'dct-ai-section' },
          h('div', { className:'dct-ai-section-head' },
            h('h4', null, t('aiColorNote'))),
          h('div', { className:'dct-ai-colors' }, modeBlock('light'), modeBlock('dark'))),

        h('div', { className:'dct-ai-section' },
          h('div', { className:'dct-ai-section-head' },
            h('h4', null, t('aiReply')),
            h('span', null, t('aiReplyHint'))),
          h('textarea', {
            className:'dct-ai-textarea is-reply', rows:5, value:reply, spellCheck:false,
            placeholder:'{"light":{...},"dark":{...}}',
            onChange:event => setReply(event.target.value), 'aria-label':t('aiReply')
          }),
          h('div', { className:'dct-ai-row-actions' },
            h('button', { type:'button', className:'dct-action', onClick:parseReply }, t('aiParse')),
            error ? h('span', { className:'dct-ai-error' }, error) : null,
            status ? h('span', { className:'dct-ai-ok' }, status) : null)),

        h('div', { className:'dct-ai-section' },
          h('div', { className:'dct-ai-section-head' }, h('h4', null, t('aiPreview'))),
          h('div', { className:'dct-ai-previews' }, preview('light'), preview('dark'))),

        h('p', { className:'dct-ai-fallback' },
          h('button', { type:'button', className:'dct-ai-link', onClick:downloadPrompt }, t('aiDownload'))),

        h('div', { className:'dct-ai-footer' },
          h('button', { type:'button', className:'dct-mini', onClick:() => { setDraft(clone(initialPalette)); setError(''); setStatus(''); } }, t('aiReset')),
          h('div', { className:'dct-ai-footer-right' },
            h('button', { type:'button', className:'dct-mini', onClick:onClose }, t('aiClose')),
            h('button', { type:'button', className:'dct-ai-primary', onClick:apply }, t('aiApply')))))));
  }

  return function CustomThemeCard({ controller, t, chat }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const [busy, setBusy] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const pending = useRef(false);
    const modeLabel = mode => state.modeNames[mode] || t(mode);
    const stickerName = index => state.stickerNames[index] || t(STICKER_NAMES[index]);

    const run = async task => {
      if (pending.current) return;
      pending.current = true; setBusy(true);
      try { await task(); }
      catch { controller.notify('imageFailed'); }
      finally { pending.current = false; setBusy(false); }
    };

    const sticker = (index, className='') => h('span', { className:'dct-sticker '+className, 'aria-hidden':true, style:{ backgroundImage:`url("${art.sticker(state,index)}")` } });

    const pickImage = (event, kind, index) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      run(async () => {
        let blob;
        try { blob = await normalizeImage(file, kind); }
        catch (error) { controller.notify(error?.code === 'imageTooLarge' ? 'imageTooLarge' : 'imageFailed'); return; }
        await controller.setImage(kind, index, blob);
      });
    };

    const exportConfig = () => run(async () => {
      const current = controller.getSnapshot();
      const images = { wallpaper:null, stickers:Array.from({ length:STICKER_SLOTS }, () => null) };
      try {
        if (current.images.wallpaper) images.wallpaper = await blobToDataUrl(current.images.wallpaper);
        for (let index = 0; index < STICKER_SLOTS; index++) {
          if (current.images.stickers[index]) images.stickers[index] = await blobToDataUrl(current.images.stickers[index]);
        }
      } catch { controller.notify('exportFailed'); return; }
      const document_ = buildExport({
        palette:current.colors, title:current.title, description:current.description, greeting:current.greeting,
        modeNames:current.modeNames, stickerNames:current.stickerNames, images
      });
      downloadText(`dsh-custom-theme-${stamp()}.json`, JSON.stringify(document_, null, 2));
      controller.notify('exported');
    });

    const importConfig = event => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      run(async () => {
        let text;
        try { text = await file.text(); }
        catch { controller.notify('importFailed'); return; }
        // A colours-only file merges into the current look; a full document
        // replaces it. Try the narrow form first so a palette pack can never
        // wipe the wallpaper or the copy by accident.
        const colours = parsePaletteImport(text);
        if (colours.ok) {
          const applied = controller.applyPalette(colours.palette);
          controller.notify(applied ? 'importedColours' : 'importedColoursSame');
          return;
        }
        const parsed = parseImport(text);
        if (!parsed.ok) { controller.notify(parsed.reason); return; }
        let blobs;
        try {
          blobs = {
            wallpaper: parsed.config.images.wallpaper ? dataUrlToBlob(parsed.config.images.wallpaper) : null,
            stickers: parsed.config.images.stickers.map(value => value ? dataUrlToBlob(value) : null)
          };
        } catch { controller.notify('importFailed'); return; }
        const ok = await controller.applyConfig(parsed.config, blobs);
        controller.notify(ok ? 'imported' : 'imageFailed');
      });
    };

    const restoreAllImages = () => run(async () => {
      for (let index = 0; index < STICKER_SLOTS; index++) await controller.setImage('sticker', index, null);
      await controller.setImage('wallpaper', -1, null);
    });

    const colorField = (mode, key) => {
      const label = t('color_' + key);
      return h(ColorField, {
        key, label, modeLabel:modeLabel(mode), resetLabel:t('resetOne') + ' · ' + label,
        value:state.palette[mode][key], overridden:Boolean(state.colors[mode][key]),
        onCommit:raw => controller.setColor(mode, key, String(raw).trim().startsWith('#') ? raw : '#' + String(raw).trim()),
        onClear:() => controller.setColor(mode, key, '')
      });
    };

    const imageSlot = (kind, index, wide) => {
      const source = kind === 'wallpaper' ? art.wallpaper(state) : art.sticker(state, index);
      const overridden = kind === 'wallpaper' ? Boolean(state.images.wallpaper) : Boolean(state.images.stickers[index]);
      return h('div', { key:kind + index, className:'dct-image-slot' + (wide ? '' : ' is-sticker') },
        h('img', { src:source, alt:'', decoding:'async' }),
        kind === 'wallpaper'
          ? h('span', { className:'dct-image-label' }, t('wallpaper'))
          : h('input', {
              type:'text', className:'dct-image-name', value:state.stickerNames[index], maxLength:NAME_LIMIT,
              placeholder:t(STICKER_NAMES[index]), 'aria-label':t('stickerName') + ' · ' + t(STICKER_NAMES[index]),
              onChange:event => controller.setStickerName(index, event.target.value)
            }),
        h('div', { className:'dct-image-actions' },
          h('label', { className:'dct-mini' }, t('choose'),
            h('input', { type:'file', accept:'image/*', onChange:event => pickImage(event, kind, index) })),
          overridden ? h('button', { type:'button', className:'dct-mini', disabled:busy, onClick:() => run(() => controller.setImage(kind, index, null)) }, t('restore')) : null));
    };

    return h('section', { className:'dct-card', 'aria-label':t('title') },
      state.enabled && state.wallpaper ? h('div', { className:'dct-wallpaper-preview', 'aria-hidden':true }, h('img', { src:art.wallpaper(state), alt:'', decoding:'async' })) : null,
      h('div', { className:'dct-heading' }, state.enabled && state.stickers ? sticker(0) : h('span', { className:'dct-mark', 'aria-hidden':true }, '✧'), h('h3', null, state.title || t('title'))),
      h('p', { className:'dct-description' }, state.description || t('description')),
      h('div', { className:'dct-options', role:'group', 'aria-label':t('title') },
        MODES.map(mode => h('button', {
          key:mode, type:'button', 'aria-pressed':mode === 'default' ? !state.enabled : state.enabled && state.preference === mode,
          onClick:() => controller.choose(mode)
        }, state.enabled && state.stickers ? sticker(MODE_STICKER[mode]) : null, modeLabel(mode)))),
      h('div', { className:'dct-swatches', 'aria-label':t('palette') }, SWATCHES.map(([key,label]) => h('span', {
        key, className:'dct-swatch', style:{ background:state.palette[state.scheme === 'dark' ? 'dark' : 'light'][key] }, title:t(label), 'aria-label':t(label), role:'img'
      }))),
      h('div', { className:'dct-decoration-options' }, ['wallpaper','stickers'].map(name => h('label', { key:name },
        h('input', { type:'checkbox', checked:state[name], disabled:!state.enabled, onChange:event => controller.setDecoration(name, event.target.checked) }), t(name)))),
      // Chat-panel effect: one switch for the static Gaussian blur. Only
      // meaningful while the wallpaper layer is up, which is what it blurs.
      h('div', { className:'dct-material' },
        h('span', { className:'dct-material-label' }, t('material')),
        h('label', { className:'dct-material-switch' },
          h('input', {
            type:'checkbox', checked:state.panelBlur, disabled:!state.enabled || !state.wallpaper,
            onChange:event => controller.setPanelBlur(event.target.checked)
          }),
          t('gaussian')),
        h('label', { className:'dct-material-switch' },
          h('input', {
            type:'checkbox', checked:state.advancedBlur, disabled:!state.enabled || !state.wallpaper,
            onChange:event => controller.setAdvancedBlur(event.target.checked)
          }),
          t('advancedBlur'))),
      h('p', { className:'dct-description' }, t('materialNote')),
      h('p', { className:'dct-description' }, t('artNote')),
      state.enabled && state.stickers ? h('div', { className:'dct-sticker-gallery' }, STICKER_NAMES.map((name,index) => h('div', { key:name, title:stickerName(index) }, sticker(index), h('span', null, stickerName(index))))) : null,
      !state.enabled ? null : h('div', null,
        h('p', { className:'dct-description' }, t('customHint')),
        h('details', { className:'dct-custom' },
          h('summary', null, t('customColors')),
          h('div', { className:'dct-custom-body' }, MODE_KEYS.map(mode => h('div', { key:mode, className:'dct-color-group' },
            h('div', { className:'dct-color-group-head' },
              h('span', null, modeLabel(mode)),
              h('button', { type:'button', className:'dct-mini', disabled:busy || !Object.keys(state.colors[mode]).length, onClick:() => controller.resetColors(mode) }, t('resetGroup'))),
            h('div', { className:'dct-color-grid' }, PALETTE_KEYS.map(key => colorField(mode, key))))))),
        h('details', { className:'dct-custom' },
          h('summary', null, t('customCopy')),
          h('div', { className:'dct-custom-body' },
            COPY_FIELDS.map(([field,label]) => h('label', { key:field, className:'dct-text-field' },
              h('span', null, t(label)),
              h('input', { type:'text', value:state[field], placeholder:t(field), maxLength:field === 'title' ? 60 : field === 'description' ? 200 : 120, onChange:event => controller.setCopy(field, event.target.value) }))),
            MODE_KEYS.map(mode => h('label', { key:mode, className:'dct-text-field' },
              h('span', null, t(mode === 'light' ? 'lightName' : 'darkName')),
              h('input', { type:'text', value:state.modeNames[mode], maxLength:NAME_LIMIT, placeholder:t(mode), onChange:event => controller.setModeName(mode, event.target.value) }))),
            state.title || state.description || state.greeting || state.modeNames.light || state.modeNames.dark
              ? h('button', { type:'button', className:'dct-mini', disabled:busy, onClick:() => controller.resetCopy() }, t('resetGroup'))
              : null)),
        h('details', { className:'dct-custom' },
          h('summary', null, t('customImages')),
          h('div', { className:'dct-custom-body' },
            h('div', { className:'dct-image-grid' }, imageSlot('wallpaper', -1, true)),
            h('div', { className:'dct-image-grid' }, STICKER_NAMES.map((name,index) => imageSlot('sticker', index, false))),
            h('div', { className:'dct-image-actions' },
              h('button', { type:'button', className:'dct-mini', disabled:busy, onClick:restoreAllImages }, t('resetImages'))),
            h('p', { className:'dct-description' }, t('imageNote')))),
        h('div', { className:'dct-config-actions' },
          h('button', { type:'button', className:'dct-action', disabled:busy, onClick:exportConfig }, t('exportConfig')),
          h('label', { className:'dct-action' }, t('importConfig'),
            h('input', { type:'file', accept:'application/json,.json', onChange:importConfig })),
          h('button', { type:'button', className:'dct-action dct-ai-trigger', disabled:busy, onClick:() => setAiOpen(true) }, t('aiPalette')),
          h('button', { type:'button', className:'dct-action', disabled:busy, onClick:() => run(() => controller.resetAll()) }, t('resetAll')))),
      aiOpen ? h(AiPaletteDialog, {
        controller, t, chat, initialPalette:state.palette,
        onClose:() => setAiOpen(false)
      }) : null,
      h('p', { className:'dct-status', role:'status', 'aria-live':'polite' },
        t(state.enabled ? (state.scheme === 'dark' ? 'activeDark' : 'activeLight') : 'inactive'), ' · ',
        state.notice ? t(state.notice) : t(state.storageState),
        state.imageState === 'unavailable' ? h('span', null, ' · ', t('imageUnavailable')) : null),
      h('p', { className:'dct-credit' },
        t('credit'), ' · ',
        h('a', { className:'dct-credit-link', href:PROJECT_URL, target:'_blank', rel:'noreferrer noopener' }, t('homepage')), ' · ',
        h('a', { className:'dct-credit-link', href:UPSTREAM_URL, target:'_blank', rel:'noreferrer noopener' }, t('basedOn')))
    );
  };
}

/** Client plugin body: install the token layer, wallpaper/sticker artwork,
 * hero copy and the Settings → General customization card.
 * @param ctx - client cordis context.
 * @param React - the module-table React.
 * @param css - the settings card stylesheet.
 * @param assets - bundled default artwork (`wallpaper` plus six `individual` data URLs).
 */
export function applyClient(ctx, React, css, assets) {
  let controller;
  let storage;

  // Blob URLs keep the multi-megabyte artwork out of the stylesheet text: the
  // CSS carries a short URL instead of a base64 payload repeated per rule.
  const objectUrls = new Set();
  const urlCache = new WeakMap();
  let defaults;
  const urlFor = blob => {
    if (!blob) return null;
    let url = urlCache.get(blob);
    if (!url) { url = URL.createObjectURL(blob); urlCache.set(blob, url); objectUrls.add(url); }
    return url;
  };
  const defaultUrl = dataUrl => {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type:'image/webp' }));
    objectUrls.add(url);
    return url;
  };
  const ensureDefaults = () => defaults ??= { wallpaper:defaultUrl(assets.wallpaper), stickers:assets.individual.map(defaultUrl) };

  // Live artwork accessors: the settings card and the button previews read them
  // on demand, so replacing an image needs no re-registration.
  const art = {
    wallpaper(state) { return urlFor(state.images.wallpaper) ?? ensureDefaults().wallpaper; },
    sticker(state, index) { return urlFor(state.images.stickers[index]) ?? ensureDefaults().stickers[index]; }
  };

  // The settings card talks to the live conversation only through this small
  // bridge: prefill the composer and attach one artwork.
  const getService = name => { try { return ctx.get(name); } catch { return undefined; } };
  const chat = {
    sessionId() {
      const ui = getService('uiSession');
      const binding = ui && ui.current && (ui.current.value !== undefined ? ui.current.value : ui.current.getSnapshot && ui.current.getSnapshot().value);
      return binding && binding.key;
    },
    async fill(text, image) {
      const conversation = getService('conversation');
      const sessionId = this.sessionId();
      if (!conversation || !conversation.input || typeof conversation.input.shell !== 'function' || !sessionId) return { ok:false };
      try {
        const shell = conversation.input.shell(sessionId);
        if (image && typeof conversation.createDrafts === 'function') {
          try {
            const drafts = conversation.createDrafts(sessionId, [image]);
            if (Array.isArray(drafts) && drafts.length) shell.addAttachments(drafts.map(draft => draft.id));
          } catch { /* The text still lands; the user can attach the artwork manually. */ }
        }
        shell.setDraft(text);
        return { ok:true };
      } catch { return { ok:false }; }
    }
  };

  ctx.effect(() => () => {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls.clear();
    defaults = undefined;
  }, 'dsh-custom-theme: artwork urls');

  ctx.effect(() => {
    try { storage = window.localStorage; } catch { /* Browsers may block local storage. The controller reports session-only saving. */ }
    controller = createController(ctx.theme, storage, { imageStore:createIndexedImageStore() });
    return () => controller.dispose();
  });
  ctx.on('theme/change', () => controller.syncTheme());
  ctx.effect(() => installHeroCopy(controller, DEFAULT_GREETING));
  ctx.effect(() => {
    const onStorage = event => { if (storage && event.storageArea === storage && (event.key === STORAGE_KEY || event.key === null)) controller.syncStorage(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-custom-theme';
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  });
  ctx.effect(() => {
    const body = document.body;
    const previous = body.getAttribute('data-dct-art');
    const previousStickers = body.getAttribute('data-dct-stickers');
    const previousTheme = body.getAttribute('data-dct-theme');
    const artStyle = document.createElement('style');
    artStyle.dataset.plugin = 'dsh-custom-theme-art';
    document.head.appendChild(artStyle);
    // The panel blur owns its own body marker plus the Gaussian marker scan.
    const panelBlur = createPanelBlurManager();
    let signature = '';
    const sync = () => {
      const state = controller.getSnapshot();
      const stickers = Array.from({ length:STICKER_SLOTS }, (_, index) => art.sticker(state, index));
      const wallpaperUrl = art.wallpaper(state);
      const next = wallpaperUrl + '|' + stickers.join('|');
      if (next !== signature) { signature = next; artStyle.textContent = artCss({ wallpaper:wallpaperUrl, stickers }) + gaussianGlassCss() + pageEffectCss(); }
      // The stylesheet is always installed, so anything that must apply in
      // colours-only mode too (not just wallpaper mode) keys off this marker.
      body.toggleAttribute('data-dct-theme', state.enabled);
      if (state.enabled && state.wallpaper) body.setAttribute('data-dct-art', state.scheme);
      else body.removeAttribute('data-dct-art');
      body.toggleAttribute('data-dct-stickers', state.enabled && state.stickers);
      panelBlur.sync(state);
    };
    const disposePreviews = installButtonPreviews(controller, index => art.sticker(controller.getSnapshot(), index));
    sync();
    const unsubscribe = controller.subscribe(sync);
    return () => {unsubscribe();panelBlur.dispose();disposePreviews();artStyle.remove();if(previousTheme===null)body.removeAttribute('data-dct-theme');else body.setAttribute('data-dct-theme',previousTheme);if(previous===null)body.removeAttribute('data-dct-art');else body.setAttribute('data-dct-art',previous);if(previousStickers===null)body.removeAttribute('data-dct-stickers');else body.setAttribute('data-dct-stickers',previousStickers);};
  });
  ctx.effect(() => ctx.locale.register('settings.custom-theme', dictionaries));
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name:'settings.general.item', id:'custom-theme', order:12, locale:'settings.custom-theme', inject:() => ({ controller, chat })
  }, makeCard(React, art, chat)));
}
