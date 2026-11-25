import React from "react";
import Button from "../Button/Button";
import i18n from "../../i18n/i18n";

/**
 * Ошибка при отрисовке без границы оставляла пустое окно (SDA-62): одна неполная запись аккаунта
 * закрывала доступ ко всем. Показываем кнопку перезагрузки окна; текст ошибки — только в консоль
 * (она маскирует секреты): в нём могут быть данные аккаунта.
 */
class ErrorBoundary extends React.Component<{}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("render failed", error);
  }

  render() {
    if (!this.state.failed) return <>{this.props.children}</>;
    return (
      <div role="alert" style={{ padding: 24, color: "var(--sda-text)" }}>
        <p>{i18n.t("common.crash.text")}</p>
        <Button
          size="medium"
          text={i18n.t("common.crash.reload")}
          color="grey"
          hoverColor="light-grey"
          onClick={() => window.location.reload()}
        />
      </div>
    );
  }
}

export default ErrorBoundary;
