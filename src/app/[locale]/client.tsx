"use client";

import React from "react";
import { ScissorOutlined } from "@ant-design/icons";
import TextSplitter from "./TextSplitter";
import { useTranslations, useLocale } from "next-intl";
import { getDocUrl } from "@/app/utils";
import ToolPage from "@/app/components/styled/ToolPage";

const ClientPage = () => {
  const tSplitter = useTranslations("text-splitter");
  const locale = useLocale();
  const userGuideUrl = getDocUrl("guide/tools/text-splitter.html", locale);

  return (
    <ToolPage icon={<ScissorOutlined />} title={tSplitter("clientTitle")} description={tSplitter("clientDescription")} guideUrl={userGuideUrl}>
      <TextSplitter />
    </ToolPage>
  );
};

export default ClientPage;
