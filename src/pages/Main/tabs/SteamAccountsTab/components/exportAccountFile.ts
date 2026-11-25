import store from "../../../../../store/store";
import i18n from "../../../../../i18n/i18n";

/** Сохранить maFile или smaFile аккаунта: содержимое main собирает в момент клика (SDA-62). */
const exportAccountFile = async (id: string, kind: "maFile" | "smaFile") => {
  const file = await window.Main.steamAccounts
    .exportFile(id, kind)
    .catch((err): { error: string } => ({ error: String(err) }));
  if ("error" in file) {
    return store.windows.openMiniNotification({
      type: "error",
      text: i18n.t("accounts.errors.export", { error: file.error }),
    });
  }
  const link = document.createElement("a");
  link.href = "data:text/json;charset=utf-8," + encodeURIComponent(file.content);
  link.download = file.fileName;
  link.click();
};

export default exportAccountFile;
