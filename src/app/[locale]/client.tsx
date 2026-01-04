"use client";

import React from "react";
import { Typography } from "antd";
import { ScissorOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import TextSplitter from "./TextSplitter";
import { useTranslations, useLocale } from "next-intl";

const { Title, Paragraph, Link } = Typography;

const ClientPage = () => {
  const tSplitter = useTranslations("text-splitter");
  const t = useTranslations("common");
  const locale = useLocale();
  const isChineseLocale = locale === "zh" || locale === "zh-hant";

  const userGuideUrl = isChineseLocale ? "https://docs.newzone.top/guide/tools/text-splitter.html" : "https://docs.newzone.top/en/guide/tools/text-splitter.html";

  return (
    <>
      <Title level={3}>
        <ScissorOutlined /> {tSplitter("clientTitle")}
      </Title>
      <Paragraph type="secondary" ellipsis={{ rows: 3, expandable: true, symbol: "more" }}>
        <Link href={userGuideUrl} target="_blank" rel="noopener noreferrer">
          <QuestionCircleOutlined /> {t("userGuide")}
        </Link>{" "}
        {tSplitter("clientDescription")} {t("privacyNotice")}
      </Paragraph>
      <TextSplitter />
    </>
  );
};

export default ClientPage;
