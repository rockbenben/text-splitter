"use client";
import React, { useState } from "react";
import PageCard from "@/app/components/styled/PageCard";
import { Typography, Upload, Button, Input, InputNumber, App, Form, Tooltip, Space, theme, Flex, Spin, Row, Col, Segmented, Alert, Switch, Divider } from "antd";
import { FileTextOutlined, DownloadOutlined, InboxOutlined, ClearOutlined, SettingOutlined, CopyOutlined, CheckOutlined, ScissorOutlined } from "@ant-design/icons";
import { splitParagraph, downloadFile, parseSpaceSeparatedItems, getErrorMessage, escapeRegExp, getFileTypePresetConfig } from "@/app/utils";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import useFileUpload from "@/app/hooks/useFileUpload";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useTextStats } from "@/app/hooks/useTextStats";
import { useTranslations } from "next-intl";
import { saveAs } from "file-saver";

const { TextArea } = Input;
const { Dragger } = Upload;
const { Title, Paragraph, Text } = Typography;

const uploadFileTypes = getFileTypePresetConfig("richText");

const TextSplitter = () => {
  const tSplitter = useTranslations("text-splitter");
  const t = useTranslations("common");
  const { copyToClipboard } = useCopyToClipboard();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [splittedTexts, setSplittedTexts] = useState<string[]>([]);
  const [copiedIndexes, setCopiedIndexes] = useState(new Set<number>());
  // 默认 2000 字符（适合 LLM 上下文切分的典型块大小）；设为 0 则改用分隔符切分
  const [limit, setLimit] = useLocalStorage("text-splitter-limit", 2000);
  const [customFileName, setCustomFileName] = useLocalStorage("text-splitter-customFileName", "");

  const [customSplitSymbols, setCustomSplitSymbols] = useLocalStorage("text-splitter-customSplitSymbols", "");
  const [hideResults, setHideResults] = useLocalStorage("text-splitter-hideResults", false);
  const [mode, setMode] = useLocalStorage<"count" | "cn-paragraph" | "en-paragraph">("text-splitter-mode", "count");

  const { isFileProcessing, fileList, multipleFiles, sourceText, setSourceText, handleFileUpload, handleUploadRemove, handleUploadChange, resetUpload } = useFileUpload();

  const sourceStats = useTextStats(sourceText);
  const [autoHide, setAutoHide] = useState(false);

  const updateResults = (texts: string[]) => {
    setSplittedTexts(texts);
    setCopiedIndexes(new Set());
    if (texts.length > 500) {
      setAutoHide(true);
      message.warning("Result too large (>500), display hidden for performance.");
    } else {
      setAutoHide(false);
      message.success(tSplitter("textSplit"));
    }
  };

  // 解析多个自定义分割符号，支持转义字符
  const getCustomSymbolsArray = () => parseSpaceSeparatedItems(customSplitSymbols);

  // 使用 splitParagraph 函数处理中文文本并按换行分割
  const splitByParagraph = async (method: "cn" | "en" = "cn") => {
    setSplittedTexts([]);
    if (!sourceText.trim()) {
      message.error(t("noSourceText"));
      return;
    }

    try {
      // 使用 splitParagraph 函数处理文本，支持中文和英文
      const processedText = await splitParagraph(sourceText, method);

      // 按换行符分割
      const paragraphs = processedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      updateResults(paragraphs);
    } catch (error: unknown) {
      console.error("Split by paragraph failed:", error);
      const errMsg = getErrorMessage(error);
      message.error("An error occurred while processing the text: " + errMsg);
    }
  };

  // 仅按符号分割的函数
  const splitBySymbolsOnly = (text: string, symbols: string[]): string[] => {
    if (symbols.length === 0) return [text];

    // 创建正则表达式，使用 escapeRegExp 转义特殊字符
    const escapedSymbols = symbols.map((symbol) => escapeRegExp(symbol));
    const regex = new RegExp(`(${escapedSymbols.join("|")})`, "g");

    // 按符号分割
    const parts = text.split(regex);
    const result: string[] = [];

    for (let i = 0; i < parts.length; i += 2) {
      const content = parts[i];
      const separator = parts[i + 1];

      if (content && content.trim()) {
        // 将分割符号保留在当前段落的末尾
        const segment = separator ? (content + separator).trim() : content.trim();
        result.push(segment);
      }
    }

    // 过滤空字符串
    return result.filter((part) => part.length > 0);
  };

  const splitText = () => {
    setSplittedTexts([]);
    if (!sourceText.trim()) {
      message.error(t("noSourceText"));
      return;
    }

    // limit 为 0 或空 => 纯按分隔符切分，此时分隔符字段必填。
    if (!limit || limit === 0) {
      const symbols = getCustomSymbolsArray();
      if (symbols.length === 0) {
        message.error(tSplitter("customSplitSymbol"));
        return;
      }
      updateResults(splitBySymbolsOnly(sourceText, symbols));
      return;
    }

    // limit > 0：按长度切块。若用户填了分隔符，切点自动吸附到最近的分隔符（避免截句）；
    // 留空则硬按长度切。是否对齐完全由分隔符字段是否有值决定，无需单独开关。
    const alignSymbols = getCustomSymbolsArray();
    const singleLineText = sourceText.replace(/[\r\n]+/g, " ");
    const newSplittedTexts: string[] = [];
    let start = 0;

    while (start < singleLineText.length) {
      let end = start + limit;

      if (end < singleLineText.length && alignSymbols.length > 0) {
        // 从结束位置向前搜索确定精确的分割点
        const findSplitPoint = (symbols: string[]) => {
          if (symbols.length === 0) return null;
          for (let i = end; i >= start; i--) {
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
              // 对于多字符符号，我们需要正确调整 i
              const matchedSymbol = symbols.find((symbol) => {
                if (symbol.length === 1) {
                  return singleLineText[i] === symbol;
                } else {
                  const startIndex = i - symbol.length + 1;
                  if (startIndex < start) return false;
                  return singleLineText.substring(startIndex, i + 1) === symbol;
                }
              });
              const adjustment = matchedSymbol ? matchedSymbol.length : 1;
              // 确保分割点不会超出内容范围
              return i + adjustment < singleLineText.length ? i + adjustment : end;
            }
          }
          return null;
        };

        // 使用自定义符号查找分割点
        const newEnd = findSplitPoint(alignSymbols);
        end = newEnd || end;
      }

      // 处理最后一段文本
      end = Math.min(end, singleLineText.length);
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

  // 将完整分割文本导出为单个文件
  const handleExportFullText = () => {
    if (splittedTexts.length === 0) {
      message.error(tSplitter("noExportableText"));
      return;
    }
    let fileName = customFileName || multipleFiles[0]?.name || "split_text_all";
    if (fileName.lastIndexOf(".") < 0) {
      fileName = `${fileName}.txt`;
    }
    const fullText = splittedTexts.join("\n\n");
    downloadFile(fullText, fileName);
    message.success(tSplitter("exportedMergedText"));
  };

  // 导出 ZIP 文件
  const exportAsZip = async (texts: string[], nameWithoutExt: string, ext: string) => {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      texts.forEach((text, index) => {
        const fileName = `${nameWithoutExt}_${index + 1}${ext}`;
        zip.file(fileName, text);
      });
      const zipContent = await zip.generateAsync({ type: "blob" });
      saveAs(zipContent, `${nameWithoutExt}_split_files.zip`);

      message.success(`Exported As Zip: ${texts.length} ${nameWithoutExt}_split_files.zip}`, 5);
    } catch (error: unknown) {
      console.error("ZIP export failed: ", error);
      const errMsg = getErrorMessage(error);
      message.error("ZIP export failed: " + errMsg);
    }
  };

  // 将每个分割文本导出为单独的文件
  const handleBatchExport = async () => {
    if (splittedTexts.length === 0) {
      message.error(tSplitter("noExportableText"));
      return;
    }
    const baseFileName = customFileName || multipleFiles[0]?.name || "split_text";
    // 判断是否包含后缀
    const hasExtension = baseFileName.lastIndexOf(".") > 0;
    let nameWithoutExt, ext;
    if (hasExtension) {
      const dotIndex = baseFileName.lastIndexOf(".");
      nameWithoutExt = baseFileName.substring(0, dotIndex);
      ext = baseFileName.substring(dotIndex);
    } else {
      // 没有后缀则默认使用 .txt
      nameWithoutExt = baseFileName;
      ext = ".txt";
    }
    // 如果分割文本超过 3 个，打包成 ZIP 文件
    if (splittedTexts.length > 3) {
      await exportAsZip(splittedTexts, nameWithoutExt, ext);
    } else {
      // 少于或等于 3 个文件时，单独下载
      for (const [index, text] of splittedTexts.entries()) {
        const fileName = `${nameWithoutExt}_${index + 1}${ext}`;
        await downloadFile(text, fileName);
      }
      message.success(`${tSplitter("checkDownloadDirectory")}: ${splittedTexts.length}`, 5);
    }
  };

  return (
    <Spin spinning={isFileProcessing} description={t("pleaseWait")} size="large">
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <PageCard
            title={
              <Space>
                <FileTextOutlined />
                {t("sourceArea")}
              </Space>
            }
            extra={
              <Tooltip title={t("resetUploadTooltip")}>
                <Button
                  type="text"
                  danger
                  onClick={() => {
                    resetUpload();
                    setSplittedTexts([]);
                    message.success(t("resetUploadSuccess"));
                  }}
                  icon={<ClearOutlined />}
                  aria-label={t("resetUpload")}>
                  {t("resetUpload")}
                </Button>
              </Tooltip>
            }>
            <Dragger
              customRequest={({ file }) => handleFileUpload(file as File)}
              accept={uploadFileTypes.accept}
              showUploadList
              beforeUpload={resetUpload}
              onRemove={handleUploadRemove}
              onChange={handleUploadChange}
              fileList={fileList}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{t("dragAndDropText")}</p>
              <p className="ant-upload-hint">
                {t("supportedFormats")} {uploadFileTypes.formatLabel({ maxVisible: 5 })}
              </p>
            </Dragger>
            <TextArea
              placeholder={t("pasteUploadContent")}
              value={sourceStats.isEditable ? sourceText : sourceStats.displayText}
              onChange={sourceStats.isEditable ? (e) => setSourceText(e.target.value) : undefined}
              rows={8}
              className="mt-1"
              allowClear
              readOnly={!sourceStats.isEditable}
              aria-label={t("sourceArea")}
            />
            {sourceText && (
              <Flex justify="end" className="mt-2">
                <Typography.Text type="secondary" className="!text-xs">
                  {sourceStats.charCount} {t("charLabel")} / {sourceStats.lineCount} {t("lineLabel")}
                </Typography.Text>
              </Flex>
            )}
          </PageCard>
        </Col>

        <Col xs={24} lg={8}>
          <PageCard
            title={
              <Space>
                <SettingOutlined />
                {t("configuration")}
              </Space>
            }>
            <Form layout="vertical" className="[&_.ant-form-item]:!mb-3">
              {/* 三种模式：
                  - count: 按长度切块；limit>0 时可选"对齐分隔符"使断点落在分隔符上。
                           limit=0 或为空时自动变为纯按分隔符切分（要求必须填分隔符）。
                  - cn/en-paragraph: 调 splitParagraph() 做语言感知的段落检测 */}
              <Form.Item label={t("operation")} className="!mb-2">
                <Segmented
                  block
                  value={mode}
                  onChange={(value) => setMode(value as typeof mode)}
                  options={[
                    { label: tSplitter("splitByLength"), value: "count" },
                    { label: tSplitter("splitByChineseParagraph"), value: "cn-paragraph" },
                    { label: tSplitter("splitByEnglishParagraph"), value: "en-paragraph" },
                  ]}
                />
              </Form.Item>
              <Typography.Text type="secondary" className="!text-xs !block !mb-3">
                {mode === "count" && tSplitter("splitByLengthHint")}
                {mode === "cn-paragraph" && tSplitter("splitByChineseParagraphTooltip")}
                {mode === "en-paragraph" && tSplitter("splitByEnglishParagraphTooltip")}
              </Typography.Text>

              {/* count 模式：长度阈值（min=0；=0 时纯按分隔符切）+ 可选的对齐分隔符细化边界 */}
              {mode === "count" && (
                <>
                  <Form.Item label={tSplitter("splitCharacterCount")} help={tSplitter("emptyForSymbolOnly")}>
                    <InputNumber
                      min={0}
                      value={limit ?? null}
                      onChange={(value) => setLimit(value ?? 0)}
                      placeholder="2000"
                      addonAfter={t("charLabel")}
                      className="!w-full"
                      aria-label={tSplitter("splitCharacterCount")}
                    />
                  </Form.Item>

                  {/* 分隔符字段总是可见。limit>0 时有值则对齐，空则硬按长度切；limit=0 时必填。 */}
                  <Form.Item label={tSplitter("customSplitSymbol")} help={tSplitter("supportEscapeChars")}>
                    <Input
                      value={customSplitSymbols}
                      onChange={(e) => setCustomSplitSymbols(e.target.value)}
                      placeholder={tSplitter("customSplitSymbol")}
                      aria-label={tSplitter("customSplitSymbol")}
                      allowClear
                    />
                    <Space size="small" className="!mt-2">
                      <Button size="small" onClick={() => setCustomSplitSymbols("。 ？ ！")}>
                        {tSplitter("chineseEndingSymbol")}
                      </Button>
                      <Button size="small" onClick={() => setCustomSplitSymbols(". ? !")}>
                        {tSplitter("englishEndingSymbol")}
                      </Button>
                    </Space>
                  </Form.Item>
                </>
              )}

              {/* 通用：结果过多时隐藏预览（保留导出功能） */}
              <Form.Item className="!mb-3">
                <Flex justify="space-between" align="center">
                  <Tooltip title={t("hideResultsTooltip")}>
                    <span>{t("hideResults")}</span>
                  </Tooltip>
                  <Switch size="small" checked={hideResults} onChange={setHideResults} />
                </Flex>
              </Form.Item>

              {/* 导出文件名放最后：既用于批量导出，也用于 ZIP 命名 */}
              <Form.Item label={tSplitter("exportFileName")} className="!mb-0">
                <Space.Compact className="w-full">
                  <Input value={customFileName} onChange={(e) => setCustomFileName(e.target.value)} placeholder="split_text" aria-label={tSplitter("exportFileName")} allowClear />
                  <Space.Addon>.txt</Space.Addon>
                </Space.Compact>
              </Form.Item>
            </Form>
          </PageCard>
        </Col>
      </Row>

      {/* 主执行按钮：按 mode 分派到对应的 split 函数。
          count 模式下，limit=0 走 splitText() 的纯分隔符分支。 */}
      <Button
        type="primary"
        size="large"
        block
        className="!mt-4"
        icon={<ScissorOutlined />}
        onClick={() => {
          if (mode === "count") splitText();
          else if (mode === "cn-paragraph") splitByParagraph("cn");
          else splitByParagraph("en");
        }}>
        {mode === "count" && (!limit || limit === 0)
          ? tSplitter("splitBySymbol")
          : mode === "cn-paragraph"
          ? tSplitter("splitByChineseParagraph")
          : mode === "en-paragraph"
          ? tSplitter("splitByEnglishParagraph")
          : tSplitter("splitText")}
      </Button>

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

          <Flex justify="center" gap="middle" className="!mb-5">
            <Tooltip title={tSplitter("mergeText")}>
              <Button type="primary" ghost icon={<FileTextOutlined />} onClick={handleExportFullText} size="large">
                {tSplitter("exportMergedText")}
              </Button>
            </Tooltip>
            <Tooltip title={tSplitter("exportIndividualFiles")}>
              <Button icon={<DownloadOutlined />} onClick={handleBatchExport} size="large">
                {tSplitter("batchExport")}
              </Button>
            </Tooltip>
          </Flex>

          {autoHide && !hideResults && (
            <Alert
              message="Result too large (>500), display hidden for performance."
              type="warning"
              showIcon
              className="mb-4"
              action={
                <Button size="small" type="text" onClick={() => setAutoHide(false)}>
                  Show Anyway
                </Button>
              }
            />
          )}

          {!hideResults && !autoHide && (
            <Row gutter={[16, 16]}>
              {splittedTexts.map((text, index) => (
                <Col xs={24} md={12} xl={8} key={index}>
                  <PageCard
                    size="small"
                    title={`#${index + 1}`}
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
                    <Paragraph ellipsis={{ rows: 6, expandable: true, symbol: "more" }} className="!m-0 !font-mono !whitespace-pre-wrap">
                      {text}
                    </Paragraph>
                  </PageCard>
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
