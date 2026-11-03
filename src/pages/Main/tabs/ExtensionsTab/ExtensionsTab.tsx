import react, { FC } from "react";
import { useTranslation } from "react-i18next";

const ExtensionTab: FC = () => {
  const { t } = useTranslation();
  return (
    <div className="main">
      <div className="list-container">
        <h1
          style={{
            top: "50%",
            left: "50%",
            position: "relative",
            transform: "translate(-50%, -50%)",
            lineHeight: "100%",
          }}
        >
          {t("common.inDevelopment")}
        </h1>
      </div>
    </div>
  );
};

export default ExtensionTab;
