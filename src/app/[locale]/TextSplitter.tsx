"use client";
import React, { useState } from "react";
import { Typography, Upload, Button, Input, Checkbox, App, Form, Tooltip, Space, theme, Flex, Spin, Card, Row, Col, Divider, Collapse } from "antd";
import { FileTextOutlined, DownloadOutlined, InboxOutlined, ClearOutlined, SettingOutlined, CopyOutlined, CheckOutlined, ScissorOutlined } from "@ant-design/icons";
import { splitParagraph, downloadFile, parseSpaceSeparatedItems, getErrorMessage } from "@/app/utils";
import { useCopyToClipboard } from "@/app/hooks/useCopyToClipboard";
import useFileUpload from "@/app/hooks/useFileUpload";
import { useLocalStorage } from "@/app/hooks/useLocalStorage";
import { useTextStats } from "@/app/hooks/useTextStats";
import { useTranslations } from "next-intl";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const { TextArea } = Input;
const { Dragger } = Upload;
const { Title, Paragraph } = Typography;

const TextSplitter = () => {
  const tSplitter = useTranslations("text-splitter");
  const t = useTranslations("common");
  const { copyToClipboard } = useCopyToClipboard();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [splittedTexts, setSplittedTexts] = useState<string[]>([]);
  const [copiedIndexes, setCopiedIndexes] = useState(new Set<number>());
  const [limit, setLimit] = useLocalStorage("text-splitter-limit", 2000);
  const [customFileName, setCustomFileName] = useLocalStorage("text-splitter-customFileName", "");
  const [largeMode, setLargeMode] = useState(false);
  // 多个自定义分割符号
  const [useCustomSplitter, setUseCustomSplitter] = useLocalStorage("text-splitter-useCustomSplitter", false);
  const [customSplitSymbols, setCustomSplitSymbols] = useLocalStorage("text-splitter-customSplitSymbols", "");
  const [hideResults, setHideResults] = useLocalStorage("text-splitter-hideResults", false);

  const { isFileProcessing, fileList, multipleFiles, sourceText, setSourceText, handleFileUpload, handleUploadRemove, handleUploadChange, resetUpload } = useFileUpload();

  const sourceStats = useTextStats(sourceText);

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

      setSplittedTexts(paragraphs);
      setCopiedIndexes(new Set());
      message.success(tSplitter("textSplit"));
    } catch (error: unknown) {
      console.error("Split by paragraph failed:", error);
      const errMsg = getErrorMessage(error);
      message.error("An error occurred while processing the text: " + errMsg);
    }
  };

  // 仅按符号分割的函数
  const splitBySymbolsOnly = (text: string, symbols: string[]): string[] => {
    if (symbols.length === 0) return [text];

    // 创建正则表达式，转义特殊字符
    const escapedSymbols = symbols.map((symbol) => symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
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

    // 自定义分割符号数组
    const customSymbols = useCustomSplitter ? getCustomSymbolsArray() : [];

    // 如果字符数限制为空或0，且启用了自定义分割符号，则仅按符号分割
    if ((!limit || limit === 0) && useCustomSplitter && customSymbols.length > 0) {
      // 仅按自定义符号分割，不限制字符数
      const newSplittedTexts = splitBySymbolsOnly(sourceText, customSymbols);
      setSplittedTexts(newSplittedTexts);
      setCopiedIndexes(new Set());
      message.success(tSplitter("textSplit"));
      return;
    }

    // 原有的按字符数限制分割逻辑
    const singleLineText = sourceText.replace(/[\r\n]+/g, " ");
    const newSplittedTexts: string[] = [];
    let start = 0;

    while (start < singleLineText.length) {
      let end = start + (limit || 2000);

      // 如果启用了按句子结束符或自定义符号分割
      if (end < singleLineText.length && useCustomSplitter && customSymbols.length > 0) {
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
        const newEnd = findSplitPoint(customSymbols);
        end = newEnd || end;
      }

      // 处理最后一段文本
      end = Math.min(end, singleLineText.length);
      const segment = singleLineText.slice(start, end);
      newSplittedTexts.push(segment);

      start = end;
    }

    setSplittedTexts(newSplittedTexts);
    setCopiedIndexes(new Set());
    message.success(tSplitter("textSplit"));
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
    console.log("nameWithoutExt:", nameWithoutExt, "ext:", ext);
    // 如果分割文本超过 10 个，打包成 ZIP 文件
    if (splittedTexts.length > 10) {
      await exportAsZip(splittedTexts, nameWithoutExt, ext);
    } else {
      // 少于或等于 10 个文件时，单独下载
      for (const [index, text] of splittedTexts.entries()) {
        const fileName = `${nameWithoutExt}_${index + 1}${ext}`;
        await downloadFile(text, fileName);
      }
      message.success(`${tSplitter("checkDownloadDirectory")}: ${splittedTexts.length}`, 5);
    }
  };

  return (
    <Spin spinning={isFileProcessing} tip="Processing..." size="large">
      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <Card
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
            }
            className="shadow-sm">
            <Dragger
              customRequest={({ file }) => handleFileUpload(file as File)}
              accept=".txt,.md,.markdown,.json,.srt,.ass,.vtt,.csv,.tsv,.xml,.yaml,.yml,.log,.ini,.html,.css,.js,.py,.java,.sql"
              showUploadList
              beforeUpload={resetUpload}
              onRemove={handleUploadRemove}
              onChange={handleUploadChange}
              fileList={fileList}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">{t("dragAndDropText")}</p>
              <p className="ant-upload-hint">{t("supportedFormats")} .txt, .md, .markdown, .json, .srt...</p>
            </Dragger>

            {!largeMode && (
              <>
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
                  <Paragraph type="secondary">
                    {t("inputStatsTitle")}: {sourceStats.charCount} {t("charLabel")}, {sourceStats.lineCount} {t("lineLabel")}
                  </Paragraph>
                )}
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Space orientation="vertical" size="small" style={{ width: "100%" }}>
            <Card
              title={
                <Space>
                  <SettingOutlined />
                  {t("configuration")}
                </Space>
              }
              className="shadow-sm">
              <Form layout="vertical">
                <Form.Item label={tSplitter("splitCharacterCount")} tooltip={tSplitter("emptyForSymbolOnly")}>
                  <Space.Compact className="w-full">
                    <Input
                      type="number"
                      value={limit || ""}
                      onChange={(e) => setLimit(e.target.value ? parseInt(e.target.value, 10) : 0)}
                      placeholder={tSplitter("emptyForSymbolOnly")}
                      allowClear
                      aria-label={tSplitter("splitCharacterCount")}
                    />
                    <Space.Addon style={{ minWidth: 80 }}>{t("charLabel")}</Space.Addon>
                  </Space.Compact>
                </Form.Item>

                <Form.Item style={{ marginTop: -12, marginBottom: 0 }}>
                  <Checkbox onChange={(e) => setUseCustomSplitter(e.target.checked)} checked={useCustomSplitter}>
                    {tSplitter("splitByCustomSymbol")}
                  </Checkbox>
                </Form.Item>

                {useCustomSplitter && (
                  <>
                    <Form.Item help={tSplitter("supportEscapeChars")}>
                      <Input
                        value={customSplitSymbols}
                        onChange={(e) => setCustomSplitSymbols(e.target.value)}
                        placeholder={tSplitter("customSplitSymbol")}
                        aria-label={tSplitter("customSplitSymbol")}
                      />
                    </Form.Item>
                    <Space size="small" style={{ marginTop: 4 }}>
                      <Button size="small" onClick={() => setCustomSplitSymbols("。 ？ ！")}>
                        {tSplitter("chineseEndingSymbol")}
                      </Button>
                      <Button size="small" onClick={() => setCustomSplitSymbols(". ? !")}>
                        {tSplitter("englishEndingSymbol")}
                      </Button>
                    </Space>
                  </>
                )}

                <Divider style={{ margin: "12px 0" }} />

                <Form.Item label={tSplitter("exportFileName")}>
                  <Space.Compact className="w-full">
                    <Input value={customFileName} onChange={(e) => setCustomFileName(e.target.value)} placeholder="split_text" aria-label={tSplitter("exportFileName")} />
                    <Space.Addon>.txt</Space.Addon>
                  </Space.Compact>
                </Form.Item>
                <Collapse
                  ghost
                  style={{ marginTop: -12 }}
                  expandIconPlacement="end"
                  items={[
                    {
                      key: "1",
                      label: (
                        <Space>
                          <SettingOutlined />
                          <span>{t("advancedSettings")}</span>
                        </Space>
                      ),
                      children: (
                        <Flex vertical gap="small">
                          <Checkbox checked={largeMode} onChange={(e) => setLargeMode(e.target.checked)}>
                            {t("largeMode")}
                          </Checkbox>
                          <Checkbox onChange={(e) => setHideResults(e.target.checked)} checked={hideResults}>
                            {t("hideResults")}
                          </Checkbox>
                        </Flex>
                      ),
                    },
                  ]}
                />
              </Form>
            </Card>

            <Card className="shadow-sm" styles={{ body: { padding: 16 } }}>
              <Button type="primary" block size="large" onClick={splitText} icon={<ScissorOutlined />} style={{ fontSize: 16, marginBottom: 12 }}>
                {sourceText ? ((!limit || limit === 0) && useCustomSplitter && customSplitSymbols ? `${tSplitter("splitBySymbol")}` : `${tSplitter("splitText")}`) : tSplitter("splitText")}
              </Button>
              <Flex gap="small">
                <Tooltip title={tSplitter("splitByChineseParagraphTooltip")}>
                  <Button block onClick={() => splitByParagraph("cn")}>
                    {tSplitter("splitByChineseParagraph")}
                  </Button>
                </Tooltip>
                <Tooltip title={tSplitter("splitByEnglishParagraphTooltip")}>
                  <Button block onClick={() => splitByParagraph("en")}>
                    {tSplitter("splitByEnglishParagraph")}
                  </Button>
                </Tooltip>
              </Flex>
            </Card>
          </Space>
        </Col>
      </Row>

      {splittedTexts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Divider>
            <Space>
              <CheckOutlined style={{ color: token.colorSuccess }} />
              <Title level={4} style={{ margin: 0 }}>
                {t("result")} ({splittedTexts.length} {tSplitter("segment")})
              </Title>
            </Space>
          </Divider>

          <Flex justify="center" gap="middle" style={{ marginBottom: 24 }}>
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

          {!hideResults && (
            <Row gutter={[16, 16]}>
              {splittedTexts.map((text, index) => (
                <Col xs={24} md={12} xl={8} key={index}>
                  <Card
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
                    <Paragraph ellipsis={{ rows: 6, expandable: true, symbol: "more" }} style={{ margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
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
