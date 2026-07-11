import { escapeRegExp } from "@/app/utils";

// 两套句末标点。也是配置区两个预设按钮的取值来源——别再在 JSX 里写字面量。
export const CJK_SPLIT_SYMBOLS = "。 ？ ！";
export const LATIN_SPLIT_SYMBOLS = ". ? !";

// 使用全角句末标点的语种。ja 与中文同套；ko 现代文本用拉丁标点，故不在此列。
const CJK_PUNCT_LOCALES = new Set(["zh", "zh-hant", "ja"]);

/**
 * 按界面语言取默认切分符号。首屏模式就是 symbol，默认值留空会让新用户第一次点主
 * 按钮就吃报错；但两套合并成一份也不行——裸 ASCII "." 在真实文本里根本不是句末
 * 标记，会把 3.5 切成 "3." / "5"、把 config.json 切成 "config." / "json"、把
 * tools.newzone.top 切成三段，中文用户看到的是被切碎的小数和网址。
 *
 * 所以按语种给一套，而不是给合集。这只是默认值：用户可随时改，两个预设按钮也能
 * 一键切换到另一套。
 *
 * 注意这仍不覆盖句末标点既非全角也非 ASCII 的语种（阿拉伯语 ؟ U+061F、印地语
 * danda U+0964、泰语无句末标点等）——那些语种靠 splitBySymbolMode 里的"一个都没
 * 命中"警告兜底，而不是靠默认值猜中。
 */
export const getDefaultSplitSymbols = (locale: string): string => (CJK_PUNCT_LOCALES.has(locale) ? CJK_SPLIT_SYMBOLS : LATIN_SPLIT_SYMBOLS);

// 按分隔符切分：每个分隔符处切出"最小段"（分隔符保留在段尾），再每 interval
// 个最小段合成一段。合并放在 trim 之前——英文 ". " 的组内空格必须保留，
// 若先 trim 再拼接会得到 "Aa.Bb."。
export const splitBySymbolsOnly = (text: string, symbols: string[], interval = 1): string[] => {
  if (symbols.length === 0) return [text];
  const groupSize = Number.isFinite(interval) && interval >= 1 ? Math.floor(interval) : 1;

  // 创建正则表达式，使用 escapeRegExp 转义特殊字符
  const escapedSymbols = symbols.map((symbol) => escapeRegExp(symbol));
  const regex = new RegExp(`(${escapedSymbols.join("|")})`, "g");
  const parts = text.split(regex);

  // 先切出未 trim 的最小段。空内容段(连续/行首分隔符)对应的分隔符不能随
  // 内容一起丢——上一段存在则接到其末尾,否则积攒为下一段的前缀,保证
  // 导出合并文本能还原输入字符。
  const units: string[] = [];
  let pendingSeparators = "";

  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i];
    const separator = parts[i + 1] ?? "";

    if (content && content.trim()) {
      units.push(pendingSeparators + content + separator);
      pendingSeparators = "";
    } else if (separator) {
      if (units.length > 0) units[units.length - 1] += separator;
      else pendingSeparators += separator;
    }
  }

  if (pendingSeparators) units.push(pendingSeparators);

  const result: string[] = [];
  for (let i = 0; i < units.length; i += groupSize) {
    result.push(units.slice(i, i + groupSize).join("").trim());
  }
  return result.filter((part) => part.length > 0);
};
