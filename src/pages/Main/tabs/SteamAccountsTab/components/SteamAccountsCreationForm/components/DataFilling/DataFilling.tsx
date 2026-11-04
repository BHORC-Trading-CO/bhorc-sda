import react, { FC, useState } from "react";
import store from "../../../../../../../../store/store";
import { observer } from "mobx-react-lite";
import Navigation from "../../../../../../../../globalComponents/Navigation/Navigation";
import Button from "../../../../../../../../globalComponents/Button/Button";
import Input from "../../../../../../../../globalComponents/Input/Input";
import MaFileImport from "../../../MaFileImport/MaFileImport";
import SteamGuardConnecting from "./SteamGuardConnecting/SteamGuardConnecting";
import SmaFileInterface from "../../../../../../../../../electron/interfaces/SteamAccount/SmaFileInterface";
import sanitizeSmaFile from "../../../../../../../../../electron/components/Functions/sanitizeSmaFile";
import readFile from "../../../../../../../../globalComponents/SomeFuncs/readFile";
import { toJS } from "mobx";
import "./DataFilling.css";
import { CreationFormContent } from "../../../../../ProxiesTab/components/ProxiesCreationForm/ProxiesCreationForm";
import ImportAccountItem from "../ImportAccountItem/ImportAccountItem";
import CreateProxyBlock from "../../../ProxyBlock/CreateProxyBlock/CreateProxyBlock";
import SavedProxiesBlock from "../../../ProxyBlock/SavedProxiesBlock/SavedProxies";
import Checkbox from "../../../../../../../../globalComponents/Checkbox/Checkbox";
import uuid from "react-uuid";
import { Trans, useTranslation } from "react-i18next";

const DataFillingForm: FC = observer(() => {
  const { t } = useTranslation();
  const CreationFormSwitches = store.steamAccountsTable.creationForm.switches;
  const params = store.steamAccountsTable.creationForm.getContent();
  // «Добавить аккаунт» завершает сценарий с maFile и импорт. При подключении нового Guard
  // аккаунт добавляет кнопка «Подключить» в разделе Guard, поэтому тут кнопка вторичная.
  const isGuardSetup =
    CreationFormSwitches.creationType === "new" &&
    CreationFormSwitches.guardConnectingType === "new";
  const isPrimaryAction = !isGuardSetup;
  const footerHint =
    CreationFormSwitches.creationType !== "new"
      ? ""
      : isGuardSetup
      ? t("accounts.creation.hint.guard", { button: t("common.buttons.connect") })
      : t("accounts.creation.hint.maFile");

  return (
    <div className="steam-accounts-creation-form">
      <div className="steam-data-form">
        <div className="caption">
          <Navigation
            buttons={[
              {
                text: t("accounts.creation.tabs.new"),
                id: "new",
              },
              {
                text: t("accounts.creation.tabs.import"),
                id: "import",
              },
            ]}
            selectedId={CreationFormSwitches.creationType}
            onChange={(newId: any) => {
              store.steamAccountsTable.creationForm.editSwitches({
                creationType: newId,
              });
            }}
          />
        </div>
        {CreationFormSwitches.creationType === "new" ? (
          <NewSteamAccountForm />
        ) : (
          <ImportSteamAccountsForm />
        )}
        <div className="sda-form-footer">
          <Button
            size="medium"
            text={t("common.buttons.cancel")}
            color="grey"
            hoverColor="light-grey"
            onClick={() => {
              store.steamAccountsTable.creationForm.close();
            }}
          />
          <div className="sda-form-footer__end">
            {footerHint ? (
              <div className="sda-form-footer__hint">{footerHint}</div>
            ) : null}
            <Button
              size="medium"
              disabled={
                store.steamAccountsTable.creationForm.currentProcess ===
                "creation" || (store.steamAccountsTable.creationForm.switches.creationType === "new" &&
                !store.steamAccountsTable.creationForm.hasValidProxySelection)
              }
              text={
                store.steamAccountsTable.creationForm.switches.creationType ===
                "new"
                  ? t("accounts.creation.create")
                  : t("accounts.creation.import")
              }
              color={isPrimaryAction ? "gradient" : "grey"}
              hoverColor={isPrimaryAction ? "gradient" : "light-grey"}
              onClick={() => {
                if (
                  store.steamAccountsTable.creationForm.currentProcess ===
                  "creation"
                )
                  return alert(t("accounts.creation.alreadyRunning"));
                if (
                  store.steamAccountsTable.creationForm.switches.creationType ===
                  "new"
                ) {
                  if (params.accountName && params.password && params.maFile) {
                    store.steamAccountsTable.creationForm.runCreationProcess();
                  } else {
                    store.windows.openMiniNotification({
                      type: "error",
                      text: t("accounts.creation.missingData"),
                    });
                  }
                } else {
                  const importedAccounts = params.importedAccounts.map(
                    (account) => {
                      return {
                        links: { proxyId: account.proxyId },
                        smaFile: account.smaFile,
                      };
                    }
                  );
                  window.Main.steamAccounts.import(importedAccounts);

                  // Подгоняем размер страницы, чтобы все импортированные аккаунты
                  // были видны сразу, а не только первые pageSize штук.
                  const activeAccountsCount = Object.values(
                    store.steamAccountsTable.getSteamAccounts()
                  ).filter((sa) => !sa.deleted).length;
                  store.steamAccountsTable.ensurePageSizeFits(
                    activeAccountsCount + importedAccounts.length
                  );

                  // Прокси из .smaFile создаются при импорте — таблицу прокси тоже подгоняем
                  // (оценка сверху: дедуп в main-процессе может создать меньше).
                  const importedProxiesCount = importedAccounts.filter(
                    (a) => a.smaFile.proxy && a.smaFile.proxy.host
                  ).length;
                  if (importedProxiesCount > 0) {
                    const activeProxiesCount = store.proxiesTable
                      .getProxies()
                      .filter((p) => !p.deleted).length;
                    store.proxiesTable.ensurePageSizeFits(
                      activeProxiesCount + importedProxiesCount
                    );
                  }

                  store.steamAccountsTable.creationForm.editContent({
                    importedAccounts: [],
                  });
                  store.steamAccountsTable.creationForm.close();
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

const ImportSteamAccountsForm: FC = observer(() => {
  const { t } = useTranslation();
  const params = store.steamAccountsTable.creationForm.getContent();
  const importedAccounts = params.importedAccounts;

  return (
    <div className="import-steam-account-block">
      <Button
        text={
          importedAccounts.length === 0
            ? t("accounts.import.loadSmaFile")
            : t("accounts.import.selectedFiles", {
                count: importedAccounts.length,
                names: importedAccounts
                  .map((account) => account.smaFile.accountName)
                  .join(", "),
              })
        }
        size="medium"
        icon="upload"
        color="grey"
        hoverColor="light-grey"
        style={{ width: "100%" }}
        onClick={() => {
          const el = document.getElementById("smaFileImportInput");
          el?.click();
        }}
      />
      <input
        id="smaFileImportInput"
        multiple
        type="file"
        style={{ display: "none" }}
        onChange={async (event) => {
          const files = event.target.files;
          if (files) {
            const smaFiles: SmaFileInterface[] = [];
            const rejected: string[] = [];
            for (var i in files) {
              if (!Number(i) && i !== "0") continue;
              try {
                // Очищаем файл до записи в состояние и первого показа превью.
                smaFiles.push(sanitizeSmaFile(await readFile(files[i])));
              } catch (err) {
                // Неправильный файл пропускаем, остальные импортируем; называем файл и причину.
                rejected.push(`${files[i].name}: ${err instanceof Error ? err.message : err}`);
              }
            }
            if (rejected.length) {
              store.windows.openMiniNotification({
                type: "error",
                text: t("accounts.import.skippedFiles", {
                  count: rejected.length,
                  details: rejected.join("; "),
                }),
              });
            }
            if (smaFiles.length === 0) return;
            store.steamAccountsTable.creationForm.editContent({
              importedAccounts: smaFiles.map((file) => {
                return {
                  proxyId: null,
                  smaFile: file,
                  tempId: uuid(),
                };
              }),
            });
          }
        }}
      />
      <div className="imported-steam-accounts">
        {importedAccounts[0] ? (
          <div className="imported-steam-accounts_header text-grey-medium">
            <div className="imported-steam-accounts_header-text"></div>
            <div className="imported-steam-accounts_header-text">{t("columns.login")}</div>
            <div className="imported-steam-accounts_header-text">{t("columns.nickname")}</div>
            <div className="imported-steam-accounts_header-text">{t("columns.proxy")}</div>
            <div className="imported-steam-accounts_header-text">maFile</div>
            <div className="imported-steam-accounts_header-text"></div>
          </div>
        ) : (
          <div className="sda-callout imported-steam-accounts__empty">
            {t("accounts.import.empty")}
          </div>
        )}

        <div className="imported-steam-account__container">
          {importedAccounts.map((data, index) => (
            <ImportAccountItem
              key={index}
              proxyId={data.proxyId}
              tempId={data.tempId}
              smaFile={data.smaFile}
            ></ImportAccountItem>
          ))}
        </div>
      </div>
    </div>
  );
});

const NewSteamAccountForm: FC = observer(() => {
  const { t } = useTranslation();
  const params = store.steamAccountsTable.creationForm.getContent();
  const switches = store.steamAccountsTable.creationForm.switches;
  const importedAccounts = params.importedAccounts;

  return (
    <>
      <section className="sda-form-section steam-data-block">
        <div className="sda-form-section__head">
          <h3 className="sda-form-section__title">{t("accounts.form.accountSection")}</h3>
        </div>
        <div className="sda-form-section__hint">
          {t("accounts.form.existingAccountData")}
        </div>
        <div className="steam-data-input__wrapper">
          <Input
            value={params.accountName}
            placeholder={t("accounts.form.steamLogin")}
            onChange={(newValue) => {
              store.steamAccountsTable.creationForm.editContent({
                accountName: newValue,
              });
            }}
          />
          <Input
            type="password"
            value={params.password}
            placeholder={t("accounts.form.steamPassword")}
            onChange={(newValue) => {
              store.steamAccountsTable.creationForm.editContent({
                password: newValue,
              });
            }}
          />
        </div>
      </section>
      <section className="sda-form-section steam-data-block">
        <div className="sda-form-section__head">
          <h3 className="sda-form-section__title">{t("accounts.form.secondaryData")}</h3>
          <span className="sda-form-section__badge">{t("accounts.form.optional")}</span>
        </div>
        <div className="steam-data-input__wrapper">
          <Input
            value={params.mail}
            placeholder={t("accounts.form.mail")}
            onChange={(newValue) => {
              store.steamAccountsTable.creationForm.editContent({
                mail: newValue,
              });
            }}
          />
          <Input
            type="password"
            value={params.mailPassword}
            placeholder={t("accounts.form.mailPassword")}
            onChange={(newValue) => {
              store.steamAccountsTable.creationForm.editContent({
                mailPassword: newValue,
              });
            }}
          />
        </div>
        <div className="steam-data-checkbox">
          <Checkbox
            isChecked={params.useSteamCookies}
            onChange={(newValue) => {
              store.steamAccountsTable.creationForm.editContent({
                useSteamCookies: newValue,
              });
            }}
          />
          <span>{t("accounts.form.useSteamCookies")}</span>
        </div>
      </section>

      <section className="sda-form-section proxy-block">
        <div className="sda-form-section__head">
          <h3 className="sda-form-section__title">{t("proxyBlock.title")}</h3>
        </div>
        <Navigation
          buttons={[
            {
              text: t("proxyBlock.noProxy"),
              id: "noProxy",
            },
            {
              text: t("proxyBlock.newProxy"),
              id: "newProxy",
            },
            {
              text: t("proxyBlock.savedProxy"),
              id: "savedProxy",
            },
          ]}
          selectedId={switches.proxy}
          onChange={(newId: any) => {
            store.steamAccountsTable.creationForm.editSwitches({
              proxy: newId,
            });
          }}
        />

        <div className="steam-account-creation_proxy-block">
          {<ProxyBlock />}
        </div>
      </section>
      <section className="sda-form-section guard-block">
        <div className="sda-form-section__head">
          <h3 className="sda-form-section__title">{t("guard.title")}</h3>
        </div>
        <Navigation
          buttons={[
            {
              text: t("guard.tabs.connect"),
              id: "new",
            },
            {
              text: t("guard.tabs.useMaFile"),
              id: "maFile",
            },
          ]}
          selectedId={switches.guardConnectingType}
          onChange={(newId: any) => {
            store.steamAccountsTable.creationForm.editSwitches({
              guardConnectingType: newId,
            });
          }}
        />

        {switches.guardConnectingType === "new" ? (
          <SteamGuardConnecting />
        ) : (
          <MaFileImport
            currentMaFile={params.maFile}
            onChange={(newMaFile) => {
              store.steamAccountsTable.creationForm.editContent({
                maFile: newMaFile,
              });
            }}
          />
        )}
      </section>
    </>
  );
});

const ProxyBlock: FC = observer(() => {
  // Trans не подписан на смену языка — хук перерисовывает блок при переключении.
  useTranslation();
  const CreationFormSwitches = store.steamAccountsTable.creationForm.switches;
  const content = store.steamAccountsTable.creationForm.getContent();

  switch (CreationFormSwitches.proxy) {
    case "noProxy":
      return (
        <div className="info-block sda-callout">
          <div>
            <Trans i18nKey="proxyBlock.notSet" components={{ br: <br /> }} />
          </div>
        </div>
      );
    case "newProxy":
      return (
        <CreateProxyBlock
          proxy={content.proxy.new}
          onChange={(newProxyData) => {
            store.steamAccountsTable.creationForm.editContent({
              proxy: { ...content.proxy, new: newProxyData },
            });
          }}
        />
      );
    case "savedProxy":
      return (
        <SavedProxiesBlock
          proxies={store.proxiesTable.getProxies()}
          activeId={content.proxy.savedId}
          onChange={(newProxyId) => {
            if (newProxyId === null) return;
            store.steamAccountsTable.creationForm.editContent({
              proxy: { ...content.proxy, savedId: newProxyId },
            });
          }}
        />
      );
  }
});

export default DataFillingForm;
