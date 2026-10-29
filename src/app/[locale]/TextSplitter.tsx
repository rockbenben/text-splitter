"use client";
import React, { useState, useRef } from "react";
import UploadSourceCard from "@/app/components/UploadSourceCard";
import { Typography, Button, Input, InputNumber, App, Form, Tooltip, Space, theme, Flex, Spin, Row, Col, Segmented, Alert, Switch, Divider, Card } from "antd";
import { SettingOutlined, FileTextOutlined, DownloadOutlined, CopyOutlined, CheckOutlined, ScissorOutlined } from "@ant-design/icons";
import { splitParagraph, downloadFile, splitFileName, parseSpaceSeparatedItems, parseEscapeChars, getErrorMessage, getFileTypePresetConfig } from "@/app/utils";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import useFileUpload from "@/app/hooks/useFileUpload";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useResetOnSourceChange } from "@/app/hooks/useResetOnSourceChange";
import { useTextStats } from "@/app/hooks/useTextStats";
import { useTranslations, useLocale } from "next-intl";
import { splitBySymbolsOnly, getDefaultSplitSymbols, CJK_SPLIT_SYMBOLS, LATIN_SPLIT_SYMBOLS } from "./splitBySymbols";
import { lazyImport } from "@/app/lib/autoReload";

const { Title, Paragraph, Text } = Typography;

const uploadFileTypes = getFileTypePresetConfig("richText");

// 合并各段的默认连接符（字面转义串，用时才解转义）。输入框留空即回落到它。
const DEFAULT_MERGE_SEPARATOR = "\\n\\n";
// 长度模式的默认块大小。取 5000 = Google Translate / DeepL 免费版单次 5000 字符
// 上限（见 FAQ），是本工具服务的场景里唯一还成立、且以字符计的硬限制——超了 API
// 直接拒。别改用「LLM 上下文比例」来定这个值：模型上下文早已远大于任何一段要发的
// 文本，按它切等于没切。社交平台那一侧也不归它管（各家字数上限小得多，
// 且 FAQ 把那种需求导向「中文/英文分段」模式）。
// 输入框留空即回落到它（所有引用统一走这个常量，别在别处写字面量）。
const DEFAULT_LIMIT = 5000;
// 分段导出超过这个段数就打 ZIP。文案里的数字通过 zipThreshold 参数注入
// （clientDescription / exportIndividualFiles），改这里即可，FAQ 里的举例需手动同步。
export const ZIP_THRESHOLD = 3;

const TextSplitter = () => {
  const tSplitter = useTranslations("TextSplitter");
  const t = useTranslations("common");
  const locale = useLocale();
  const { copyToClipboard } = useCopyToClipboard();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [splittedTexts, setSplittedTexts] = useState<string[]>([]);
  const [copiedIndexes, setCopiedIndexes] = useState(new Set<number>());
  const [limit, setLimit] = useLocalStorage<number | null>("text-splitter-limit", DEFAULT_LIMIT);
  const [customFileName, setCustomFileName] = useLocalStorage("text-splitter-customFileName", "");

  // 切分符号（symbol 模式的切分依据）与对齐分隔符（count 模式的可选切点吸附）拆成
  // 两个键。它们对「空」的含义相反——前者空 = 没得切（回落到默认值），后者空 = 就要
  // 纯硬切（splitByLengthHint 明写「若下方填入分隔符」）。共用一个键时，给前者配的
  // 默认值会顺手把后者的对齐静默打开，块长不再等于用户设的值。
  const defaultSplitSymbols = getDefaultSplitSymbols(locale);
  const [splitSymbols, setSplitSymbols] = useLocalStorage("text-splitter-splitSymbols", defaultSplitSymbols);
  const [alignSymbols, setAlignSymbols] = useLocalStorage("text-splitter-alignSymbols", "");
  // 合并形态的连接符，存字面转义串（与 text-joiner 的 lineSeparator 同约定），用时才解转义
  const [mergeSeparator, setMergeSeparator] = useLocalStorage("text-splitter-mergeSeparator", DEFAULT_MERGE_SEPARATOR);
  const [hideResults, setHideResults] = useLocalStorage("text-splitter-hideResults", false);
  const [mode, setMode] = useLocalStorage<"symbol" | "count" | "cn-paragraph" | "en-paragraph">("text-splitter-mode", "symbol");
  // 可为 null（清空输入框），调用点用 ?? 1 兜底。不在 onChange 里回填，placeholder
  // 才显示得出来——与「分割字符数」同一套清空语义，同一个表单不该有两种清空行为。
  const [symbolInterval, setSymbolInterval] = useLocalStorage<number | null>("text-splitter-symbolInterval", 1);

  const upload = useFileUpload();
  const { isFileProcessing, multipleFiles, sourceText } = upload;

  const sourceStats = useTextStats(sourceText);
  const [autoHide, setAutoHide] = useState(false);

  // 分段模式是 await 的异步路径：结果回来时源文本可能已经变了。自增序号作废在途请求
  // （同 useFileUpload 的 loadSeq），否则改源软清刚清完，过期的 promise 又把上一份
  // 源算出来的分段连同「分割完成」提示写回去——正是软清本要防的那种脏结果。
  const splitSeq = useRef(0);

  // 产物三件套永远一起复位，只此一处定义：改源、Clear All 都走它，避免出现第三处
  // 各自记得清哪几个 state 的地方（那种副本迟早漏掉一个）。
  const clearResults = () => {
    splitSeq.current++; // 作废在途的分段请求
    setSplittedTexts([]);
    setCopiedIndexes(new Set());
    setAutoHide(false);
  };

  // 改源软清：分段是纯源派生产物，源一变旧分段就作废。不清的话「复制/导出合并文本」
  // 会安静地产出上一轮的内容（按钮上没有任何过期提示）。
  useResetOnSourceChange(sourceText, clearResults);

  const updateResults = (texts: string[]) => {
    setSplittedTexts(texts);
    setCopiedIndexes(new Set());
    if (texts.length > 500) {
      setAutoHide(true);
      message.warning(tSplitter("resultTooLarge"));
    } else {
      setAutoHide(false);
      message.success(tSplitter("textSplit"));
    }
  };

  // 使用 splitParagraph 函数处理中文文本并按换行分割
  const splitByParagraph = async (method: "cn" | "en" = "cn") => {
    setSplittedTexts([]);
    if (!sourceText.trim()) {
      message.warning(t("noSourceText"));
      return;
    }

    const seq = ++splitSeq.current;
    try {
      // 使用 splitParagraph 函数处理文本，支持中文和英文
      const processedText = await splitParagraph(sourceText, method);
      // 等待期间源变了(或被 Clear All 清了)——这份结果已经不对应屏幕上的源，丢弃
      if (seq !== splitSeq.current) return;

      // 按换行符分割
      const paragraphs = processedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      updateResults(paragraphs);
    } catch (error: unknown) {
      if (seq !== splitSeq.current) return;
      console.error("Split by paragraph failed:", error);
      const errMsg = getErrorMessage(error);
      message.error(tSplitter("processTextError", { error: errMsg }), 10);
    }
  };

  // 按分隔符切分：每累计 symbolInterval 个分隔符切一刀
  const splitBySymbolMode = () => {
    setSplittedTexts([]);
    if (!sourceText.trim()) {
      message.warning(t("noSourceText"));
      return;
    }
    // 清空即回落到默认值——与 allowClear + placeholder 在 antd 里的既定语义一致
    // （同 mergeSeparator），用户点叉号不会掉进一个"字段看着已填却报错"的死角。
    const symbols = parseSpaceSeparatedItems(splitSymbols || defaultSplitSymbols);
    splitSeq.current++; // 同步路径也要作废在途的分段请求，否则它回来会盖掉这次结果
    const units = splitBySymbolsOnly(sourceText, symbols, symbolInterval ?? 1);
    // 一个分隔符都没在文本里出现：结果就是原文本身。对句末标点既非全角也非 ASCII
    // 的语种（阿拉伯语 ؟、印地语 ۔、泰语等），默认值不可能猜中，
    // 若照常报「分割完成」，用户看到的是绿色成功提示 + 一张装着全文的卡片。
    if (!symbols.some((symbol) => sourceText.includes(symbol))) {
      setSplittedTexts(units);
      setCopiedIndexes(new Set());
      setAutoHide(false);
      message.warning(tSplitter("symbolNoMatch"), 8);
      return;
    }
    updateResults(units);
  };

  const splitText = () => {
    setSplittedTexts([]);
    if (!sourceText.trim()) {
      message.warning(t("noSourceText"));
      return;
    }

    // limit > 0：按长度切块。若用户填了对齐分隔符，切点自动吸附到最近的分隔符（避免截句）；
    // 留空则硬按长度切。是否对齐完全由该字段是否有值决定，无需单独开关——所以这个字段
    // 默认必须是空的，不能借用切分符号的默认值把对齐静默打开。
    const alignSymbolList = parseSpaceSeparatedItems(alignSymbols);
    splitSeq.current++; // 作废在途的分段请求
    const singleLineText = sourceText.replace(/[\r\n]+/g, " ");
    const newSplittedTexts: string[] = [];
    // InputNumber 无 precision 约束,0.5 这类小数会让 slice 截断小数下标,
    // 产出一半空段(段数翻倍、卡片空白)。向上取整到 ≥1 的整数。(留空、旧存量 limit=0
    // 都按 DEFAULT_LIMIT 处理，不做迁移)
    const intLimit = Math.max(1, Math.ceil(limit || DEFAULT_LIMIT));
    let start = 0;

    while (start < singleLineText.length) {
      let end = start + intLimit;

      if (end < singleLineText.length && alignSymbolList.length > 0) {
        // 从结束位置向前搜索确定精确的分割点。块覆盖 start..end-1,扫描起点
        // 必须是 end-1 —— 从 end 起扫会把窗口外第一个字符上的分隔符也算进来,
        // 切出 limit+1 长的块(越过用户设定的上限)。
        const findSplitPoint = (symbols: string[]) => {
          if (symbols.length === 0) return null;
          for (let i = end - 1; i >= start; i--) {
            // 对于自定义符号，我们需要检查多字符符号
            if (
              symbols.some((symbol) => {
                if (symbol.length === 1) {
                  return singleLineText[i] === symbol;
                } else {
                  // 对于多字符符号
                  const startIndex = i - symbol.length + 1;
                  if (startIndex < start) return false;
                  return singleLineText.substring(startIndex, i + 1) === symbol;
                }
              })
            ) {
              // i 是符号【末字符】的下标(上面的匹配按"以 i 结尾"判断),
              // 切点固定为 i+1 —— 此前再加 symbol.length 会把切点推过
              // len-1 个字符,多字符分隔符("……"、"---")后面的词被拦腰
              // 切进上一块。
              return i + 1 < singleLineText.length ? i + 1 : end;
            }
          }
          return null;
        };

        // 使用自定义符号查找分割点
        const newEnd = findSplitPoint(alignSymbolList);
        end = newEnd || end;
      }

      // 处理最后一段文本
      end = Math.min(end, singleLineText.length);
      // 硬切点落在代理对(emoji)中间会把字符劈成两个 U+FFFD —— 复制/导出都
      // 是永久损坏。高位代理收尾且后面还有字符时退一格让整个字符进下一块;
      // intLimit=1 退无可退(块至少 1 码元),进一格保字符完整(仅此处可超限)。
      if (end < singleLineText.length) {
        const cu = singleLineText.charCodeAt(end - 1);
        if (cu >= 0xd800 && cu <= 0xdbff) end = end - 1 > start ? end - 1 : end + 1;
      }
      const segment = singleLineText.slice(start, end);
      newSplittedTexts.push(segment);

      start = end;
    }

    updateResults(newSplittedTexts);
  };

  const handleCopy = async (text: string, index: number) => {
    await copyToClipboard(text, `#${index + 1} `);
    setCopiedIndexes((prevIndexes) => {
      const newIndexes = new Set(prevIndexes);
      newIndexes.add(index);
      return newIndexes;
    });
  };

  // 合并形态统一在这里定义：复制与导出必须产出同一份文本，否则两个按钮名字对齐、结果却不一致。
  // 清空输入框回落到默认值 —— allowClear + placeholder 在 antd 里就是「留空=默认」的语义,
  // 若真按空串拼接,用户点一下叉号就会把全部分段粘成一堵墙,且空值还会被持久化。
  const getMergedText = () => splittedTexts.join(parseEscapeChars(mergeSeparator || DEFAULT_MERGE_SEPARATOR));

  // 将完整分割文本复制到剪贴板
  const handleCopyMergedText = () => {
    if (splittedTexts.length === 0) {
      message.error(tSplitter("noExportableText"));
      return;
    }
    copyToClipboard(getMergedText());
  };

  // 导出名：用户自己填的名字尊重其后缀；从上传文件推导出来的名字只借主名，
  // 后缀一律 .txt —— 切开的 messages.json 已经不是合法 JSON，再顶着 .json
  // 下载会覆盖/冒充原文件，而文件名输入框旁边挂的也是 .txt 后缀标。
  const resolveExportName = (fallback: string) => {
    if (customFileName) return splitFileName(customFileName);
    const uploaded = multipleFiles[0]?.name;
    return { nameWithoutExt: uploaded ? splitFileName(uploaded).nameWithoutExt : fallback, ext: ".txt" };
  };

  // 将完整分割文本导出为单个文件
  const handleExportFullText = async () => {
    if (splittedTexts.length === 0) {
      message.error(tSplitter("noExportableText"));
      return;
    }
    const { nameWithoutExt, ext } = resolveExportName("split_text_all");
    // downloadFile 会 reject（Blob 超限、浏览器拦截下载），不 await 的话
    // 成功提示照弹，用户以为存下来了
    try {
      await downloadFile(getMergedText(), `${nameWithoutExt}${ext}`);
      message.success(tSplitter("exportedMergedText"));
    } catch (error: unknown) {
      console.error("Merged export failed: ", error);
      message.error(tSplitter("processTextError", { error: getErrorMessage(error) }), 10);
    }
  };

  // 导出 ZIP 文件
  const exportAsZip = async (texts: string[], nameWithoutExt: string, ext: string) => {
    try {
      const JSZip = (await lazyImport(() => import("jszip"))).default;
      const zip = new JSZip();
      texts.forEach((text, index) => {
        const fileName = `${nameWithoutExt}_${index + 1}${ext}`;
        zip.file(fileName, text);
      });
      const zipContent = await zip.generateAsync({ type: "blob" });
      // 走 downloadFile 而不是直接 saveAs:否则同一个按钮下,超阈值的 ZIP 落进浏览器
      // 下载目录、不超阈值的逐个文件却落进用户选的导出目录
      const written = await downloadFile(zipContent, `${nameWithoutExt}_split_files.zip`);

      message.success(tSplitter("zipExported", { count: texts.length, fileName: written.fileName }), 5);
    } catch (error: unknown) {
      console.error("ZIP export failed: ", error);
      const errMsg = getErrorMessage(error);
      message.error(tSplitter("zipExportFailed", { error: errMsg }), 10);
    }
  };

  // 将每个分割文本导出为单独的文件
  const handleBatchExport = async () => {
    if (splittedTexts.length === 0) {
      message.error(tSplitter("noExportableText"));
      return;
    }
    const { nameWithoutExt, ext } = resolveExportName("split_text");
    if (splittedTexts.length > ZIP_THRESHOLD) {
      await exportAsZip(splittedTexts, nameWithoutExt, ext);
    } else {
      // 不超过阈值时逐个下载；同样不能让某一个 reject 之后还报「已导出」
      try {
        for (const [index, text] of splittedTexts.entries()) {
          await downloadFile(text, `${nameWithoutExt}_${index + 1}${ext}`);
        }
        message.success(`${tSplitter("allSegmentsExported")}: ${splittedTexts.length}`, 5);
      } catch (error: unknown) {
        console.error("Segment export failed: ", error);
        message.error(tSplitter("processTextError", { error: getErrorMessage(error) }), 10);
      }
    }
  };

  // 两个模式各有一个分隔符输入，但语义不同，所以是两个字段、两个 localStorage 键：
  //   symbol 模式 —— 切分依据，清空回落到 defaultSplitSymbols（placeholder 显示它，
  //                  与 allowClear 的既定语义一致）
  //   count  模式 —— 可选的切点对齐，清空 = 纯硬切（故无 placeholder、无默认值）
  // 转义字符清单挂 label 的 tooltip：两个分隔符字段会同屏出现（本字段 + 合并分隔符），
  // 常显两遍同样的说明会把配置面板压成说明书（实测 4 行说明 vs 1 行控件）。
  const renderSymbolsField = (value: string, onChange: (next: string) => void, placeholder?: string) => (
    <Form.Item label={tSplitter("customSplitSymbol")} tooltip={t("supportEscapeChars")}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={tSplitter("customSplitSymbol")} allowClear />
      <Space size="small" wrap className="!mt-2">
        <Button size="small" onClick={() => onChange(CJK_SPLIT_SYMBOLS)}>
          {tSplitter("chineseEndingSymbol")}
        </Button>
        <Button size="small" onClick={() => onChange(LATIN_SPLIT_SYMBOLS)}>
          {tSplitter("englishEndingSymbol")}
        </Button>
      </Space>
    </Form.Item>
  );

  return (
    <Spin spinning={isFileProcessing} description={t("pleaseWait")} size="large">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          {/* onClear 不依赖 resetUpload 把 sourceText 置空来间接触发软清:源本就为空时
              那条链路不会触发,而产物三件套里的 copiedIndexes/autoHide 会留在屏上。 */}
          <UploadSourceCard upload={upload} stats={sourceStats} fileTypes={uploadFileTypes} formatsHint={uploadFileTypes.formatLabel({ maxVisible: 5 })} textDirection="auto" onClear={clearResults} />
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={<Space><SettingOutlined /> {t("configuration")}</Space>}>
            <Form layout="vertical" className="[&_.ant-form-item]:!mb-3">
              {/* 四种模式：
                  - symbol: 纯按分隔符切分，每累计 symbolInterval 个分隔符切一刀。
                  - count: 按长度切块；若填了分隔符，切点自动吸附到最近的分隔符。
                  - cn/en-paragraph: 调 splitParagraph() 做语言感知的段落检测 */}
              {/* 短标签（符号/长度/中文/英文）省空间；每项挂 tooltip 放详细说明，
                  取代原来那条常显 hint 行。执行按钮仍用 splitBy* 全称，故这里另立短键。 */}
              <Form.Item label={t("operation")} className="!mb-3">
                <Segmented
                  block
                  value={mode}
                  onChange={(value) => setMode(value as typeof mode)}
                  options={[
                    { label: <Tooltip title={tSplitter("splitBySymbolHint")}><span>{tSplitter("modeSymbol")}</span></Tooltip>, value: "symbol" },
                    { label: <Tooltip title={tSplitter("splitByLengthHint")}><span>{tSplitter("modeLength")}</span></Tooltip>, value: "count" },
                    { label: <Tooltip title={tSplitter("splitByChineseParagraphTooltip")}><span>{tSplitter("modeChinese")}</span></Tooltip>, value: "cn-paragraph" },
                    { label: <Tooltip title={tSplitter("splitByEnglishParagraphTooltip")}><span>{tSplitter("modeEnglish")}</span></Tooltip>, value: "en-paragraph" },
                  ]}
                />
              </Form.Item>

              {/* symbol 模式：分隔符（必填）+ 每 N 个分隔符切一刀 */}
              {mode === "symbol" && (
                <>
                  {renderSymbolsField(splitSymbols, setSplitSymbols, defaultSplitSymbols)}
                  <Form.Item label={tSplitter("symbolInterval")} help={tSplitter("symbolIntervalHint")}>
                    <InputNumber
                      min={1}
                      precision={0}
                      value={symbolInterval}
                      onChange={setSymbolInterval}
                      placeholder="1"
                      className="!w-full"
                      aria-label={tSplitter("symbolInterval")}
                    />
                  </Form.Item>
                </>
              )}

              {/* count 模式：长度阈值（min=1）+ 可选的对齐分隔符细化边界 */}
              {mode === "count" && (
                <>
                  <Form.Item label={tSplitter("splitCharacterCount")}>
                    <InputNumber
                      min={1}
                      value={limit}
                      onChange={setLimit}
                      placeholder={String(DEFAULT_LIMIT)}
                      suffix={t("charLabel")}
                      className="!w-full"
                      aria-label={tSplitter("splitCharacterCount")}
                    />
                  </Form.Item>
                  {/* 无 placeholder：这个字段留空是有意义的配置（纯硬切），不该暗示存在默认值 */}
                  {renderSymbolsField(alignSymbols, setAlignSymbols)}
                </>
              )}

              {/* 以上是「怎么切」，以下是「切完拿什么」——两组关注点用一条细分隔线断开，
                  比给每组加标题省 18 份翻译，信息层级同样成立。 */}
              <Divider className="!my-4" />

              {/* 合并分隔符：复制/导出合并文本共用的连接符。转义清单同样走 label tooltip。 */}
              <Form.Item label={tSplitter("mergeSeparator")} help={tSplitter("mergeSeparatorHint")} tooltip={t("supportEscapeChars")}>
                <Input
                  value={mergeSeparator}
                  onChange={(e) => setMergeSeparator(e.target.value)}
                  placeholder={DEFAULT_MERGE_SEPARATOR}
                  aria-label={tSplitter("mergeSeparator")}
                  allowClear
                />
              </Form.Item>

              {/* 导出文件名：既用于批量导出，也用于 ZIP 命名 */}
              <Form.Item label={tSplitter("exportFileName")}>
                <Space.Compact className="w-full">
                  <Input value={customFileName} onChange={(e) => setCustomFileName(e.target.value)} placeholder="split_text" aria-label={tSplitter("exportFileName")} allowClear />
                  <Space.Addon>.txt</Space.Addon>
                </Space.Compact>
              </Form.Item>

              {/* 隐藏结果预览是「产物怎么呈现」，归到输出组末尾；夹在切分参数中间时
                  读起来像切分选项（保留导出功能，只是不渲染卡片） */}
              <Form.Item className="!mb-0">
                <Flex component="label" className="cursor-pointer" justify="space-between" align="center">
                  <Tooltip title={t("hideResultsTooltip")}>
                    <span>{t("hideResults")}</span>
                  </Tooltip>
                  <Switch size="small" checked={hideResults} onChange={setHideResults} aria-label={t("hideResults")} />
                </Flex>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        {/* 主执行按钮独占一整行，排在两张卡片之后：宽屏横跨全宽，
            窄屏堆叠时也排在配置卡之后，首次使用的人不会在没见过设置项前就先点到按钮。
            按 mode 分派到对应的 split 函数。 */}
        <Col span={24}>
          <Button
            type="primary"
            size="large"
            block
            icon={<ScissorOutlined aria-hidden />}
            onClick={() => {
              if (mode === "symbol") splitBySymbolMode();
              else if (mode === "count") splitText();
              else if (mode === "cn-paragraph") splitByParagraph("cn");
              else splitByParagraph("en");
            }}>
            {mode === "symbol"
              ? tSplitter("splitBySymbol")
              : mode === "cn-paragraph"
                ? tSplitter("splitByChineseParagraph")
                : mode === "en-paragraph"
                  ? tSplitter("splitByEnglishParagraph")
                  : tSplitter("splitText")}
          </Button>
        </Col>
      </Row>

      {splittedTexts.length > 0 && (
        <div className="!mt-6">
          <Divider>
            <Space>
              <CheckOutlined style={{ color: token.colorSuccess }} />
              <Title level={4} className="!m-0">
                {t("result")} ({splittedTexts.length} {tSplitter("segment")})
              </Title>
            </Space>
          </Divider>

          {/* 三个按钮沿「动作 × 形态」两轴命名：复制/导出 × 合并文本/分段文件，
              差异只落在动词上，便于扫读。窄屏允许换行，避免大号按钮被挤压。 */}
          <Flex justify="center" gap="middle" wrap className="!mb-5">
            <Tooltip title={tSplitter("copyMergedTextTooltip")}>
              <Button type="primary" ghost icon={<CopyOutlined aria-hidden />} onClick={handleCopyMergedText} size="large">
                {tSplitter("copyMergedText")}
              </Button>
            </Tooltip>
            <Tooltip title={tSplitter("mergeText")}>
              <Button icon={<FileTextOutlined aria-hidden />} onClick={handleExportFullText} size="large">
                {tSplitter("exportMergedText")}
              </Button>
            </Tooltip>
            <Tooltip title={tSplitter("exportIndividualFiles", { zipThreshold: ZIP_THRESHOLD })}>
              <Button icon={<DownloadOutlined aria-hidden />} onClick={handleBatchExport} size="large">
                {tSplitter("batchExport")} ({splittedTexts.length})
              </Button>
            </Tooltip>
          </Flex>

          {autoHide && !hideResults && (
            <Alert
              title={tSplitter("resultTooLarge")}
              type="warning"
              showIcon
              className="mb-4"
              action={
                <Button size="small" type="text" onClick={() => setAutoHide(false)}>
                  {tSplitter("showAnyway")}
                </Button>
              }
            />
          )}

          {!hideResults && !autoHide && (
            <Row gutter={[16, 16]}>
              {splittedTexts.map((text, index) => (
                <Col xs={24} md={12} xl={8} key={index}>
                  <Card
                    size="small"
                    title={
                      // 段长是这个工具存在的理由（喂 AI 的上下文上限、社交平台字数），
                      // 卡头本来就空着半行，把它摆在序号旁边，省得逐段去数
                      <Space size={8}>
                        <span>{`#${index + 1}`}</span>
                        <Text type="secondary" className="!text-xs !font-normal">
                          {text.length} {t("charLabel")}
                        </Text>
                      </Space>
                    }
                    extra={
                      <Tooltip title={t("copy")}>
                        <Button
                          type="text"
                          size="small"
                          icon={copiedIndexes.has(index) ? <CheckOutlined style={{ color: token.colorSuccess }} /> : <CopyOutlined />}
                          onClick={() => handleCopy(text, index)}
                          aria-label={`${t("copy")} #${index + 1}`}
                        />
                      </Tooltip>
                    }
                    hoverable
                    style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    {/* 分段是多行正文:dir=auto 在 div 上只有 isolate,逐行判定要显式 plaintext */}
                    <Paragraph dir="auto" style={{ unicodeBidi: "plaintext" }} ellipsis={{ rows: 6, expandable: true, symbol: t("expand") }} className="!m-0 !font-mono !whitespace-pre-wrap">
                      {text}
                    </Paragraph>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </div>
      )}
    </Spin>
  );
};

export default TextSplitter;
