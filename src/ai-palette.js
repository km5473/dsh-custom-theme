// Guidance and reply parsing for the "AI palette" dialog. This file is
// concatenated into the client bundle after palette.js, so it can read
// PALETTE_KEYS / normalizeColor directly.

/** Compact prompt prefilled into the DSH chat box. Kept short on purpose:
 * every generation pays for this text, so the role map is compressed. */
export const AI_PLUGIN_PROMPT = [
  '你是主题配色设计师。看附件里的角色立绘，先判断第一印象色（角色最醒目的两三个颜色之一，不一定是面积最大的颜色），再按它生成 DSH 主题的浅色/深色两套配色。',
  '只输出一个 JSON，不要解释，不要 Markdown 代码围栏。形状：',
  '{"light":{"base":"#rrggbb", ... 19 个 token},"dark":{...}}',
  '19 个 token 必须齐全，值一律小写 #rrggbb：',
  'base surface sidebar raised elevated text secondary tertiary muted accent accentHover accentSoft onAccent border hover code support1 support2 support3',
  '用途不能串：base=页面底/文字对比基准；surface=卡片；sidebar=侧栏；raised=抬升块；elevated=菜单/弹窗最高层（浅色最亮）；text/secondary/tertiary/muted=正文→弱提示（muted 仍要 3:1）；accent=主按钮/选中/链接；accentHover=悬停；accentSoft=标签/选中行浅底（不是按钮）；onAccent=accent 上的字；border=分隔线；hover=行悬停底；code=代码块背景（浅色近白、深色深于 base，别填反）；support1..3=饰物点/标签/小图标（不是正文）。',
  '硬要求：accent 对 base ≥3，onAccent 对 accent ≥4.5，text 对 base ≥4.5，muted 对 base ≥3；support 与 accent 色相差 ≥45°、三个彼此 ≥25°、各自对 base ≥3；浅色 base 近白，深色 base 是有色相的夜；浅色 surface→elevated 递增；暖色保持柔和，冷色可以高饱和。'
].join('\n');

/** Longer prompt for other assistants (Doubao, Qwen, ...). Downloaded as a
 * Markdown file, so it can afford the full method and contract. */
export const AI_EXTERNAL_PROMPT = [
  '# 角色立绘 → DSH 主题配色',
  '',
  '请先看我上传的角色立绘，再输出一套 DSH 主题的浅色/深色配色。不要问问题，直接给结果。',
  '',
  '## 取色方法',
  '1. 先判断第一印象色：角色最醒目的两三个颜色之一，通常不是画面里面积最大的颜色。它就是主题色 accent。',
  '2. 由 accent 派生中性色：浅色 base 提到近白，深色 base 压成带色相的夜；text 是同色相压到最深。',
  '3. accent 要压到白字（onAccent）能过 4.5:1，不要靠调灰字。暖色保持柔和，冷色可以高饱和。',
  '4. support1..3 取饰物色：缎带、金属扣、宝石、发饰、武器光效。三个不同色系，与 accent 相差 ≥45°，彼此 ≥25°，各自对 base ≥3。',
  '',
  '## 输出',
  '只输出一个 JSON，不要解释，不要 Markdown 代码围栏。形状：',
  '{"light":{"base":"#rrggbb", ...19 个 token},"dark":{...}}',
  '19 个 token 必须齐全，值一律小写 #rrggbb：',
  'base surface sidebar raised elevated text secondary tertiary muted accent accentHover accentSoft onAccent border hover code support1 support2 support3',
  '',
  '## 每个 token 画什么（不能串）',
  'base=页面底/文字对比基准；surface=卡片；sidebar=侧栏；raised=抬升块；elevated=菜单/弹窗最高层（浅色最亮，不能比 surface 暗）；text/secondary/tertiary/muted=正文→弱提示（muted 仍要 3:1）；accent=主按钮/选中/链接；accentHover=悬停；accentSoft=标签/选中行浅底（不是按钮主色）；onAccent=accent 上的字；border=分隔线；hover=行悬停底；code=代码块背景（浅色近白、深色深于 base，不能填反）；support1..3=饰物点/标签/小图标（不是正文）。',
  '',
  '## 硬要求',
  '- accent 对 base ≥3，onAccent 对 accent ≥4.5，text 对 base ≥4.5，muted 对 base ≥3。',
  '- support 与 accent 色相差 ≥45°，三个 support 彼此 ≥25°，各自对 base ≥3。',
  '- 浅色 base 近白，深色 base 是有色相的夜；浅色 surface→elevated 要递增，不能越抬越暗。',
  '- 暖色保持柔和；冷色可以高饱和。',
  '',
  '完成后只贴 JSON，方便我直接导入。'
].join('\n');

/** Filename for the downloaded prompt. */
export const AI_PROMPT_FILENAME = 'dsh-theme-ai-palette-prompt.md';

/** Find balanced top-level JSON objects in arbitrary model prose. */
function balancedObjects(text) {
  const found = [];
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === '{') depth++;
      else if (character === '}') {
        depth--;
        if (depth === 0) {
          found.push(text.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }
  return found;
}

/** Parse one AI reply into a complete light/dark palette. Accepts a bare
 * `{light,dark}`, a `{palette:{light,dark}}` envelope, code fences and prose.
 * @param text - the assistant's reply.
 * @returns `{ok:true,palette}` or `{ok:false,reason,missing?}`.
 */
export function parsePaletteReply(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ok:false, reason:'empty' };
  const sources = [];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) sources.push(match[1]);
  sources.push(text);
  const candidates = [];
  for (const source of sources) {
    candidates.push(...balancedObjects(source));
    const first = source.indexOf('{');
    const last = source.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  }
  for (const candidate of candidates) {
    let parsed;
    try { parsed = JSON.parse(candidate); } catch { continue; }
    const raw = parsed && typeof parsed === 'object' && parsed.palette && typeof parsed.palette === 'object' ? parsed.palette : parsed;
    if (!raw || typeof raw !== 'object' || (!raw.light && !raw.dark)) continue;
    const palette = { light:{}, dark:{} };
    const missing = [];
    for (const mode of ['light', 'dark']) {
      const source = raw[mode];
      if (!source || typeof source !== 'object') { missing.push(mode); continue; }
      for (const key of PALETTE_KEYS) {
        const value = normalizeColor(source[key]);
        if (value) palette[mode][key] = value;
        else missing.push(mode + '.' + key);
      }
    }
    if (missing.length === 0) return { ok:true, palette };
    return { ok:false, reason:'missing', missing };
  }
  return { ok:false, reason:'nojson' };
}
