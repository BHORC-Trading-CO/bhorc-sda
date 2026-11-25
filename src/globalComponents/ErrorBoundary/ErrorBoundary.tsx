import React from "react";
import Button from "../Button/Button";
import i18n from "../../i18n/i18n";

/**
 * Ошибка при отрисовке без границы оставляла пустое окно (SDA-62): одна неполная запись аккаунта
 * закрывала доступ ко всем. Показываем причину и кнопку перезагрузки окна.
 */
class ErrorBoundary extends React.Component<{}, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error() };
  }

  render() {
    if (!this.state.error) return <>{this.props.children}</>;
    return (
      <div role="alert" style={{ padding: 24, color: "var(--sda-text)" }}>
        <p>{i18n.t("common.crash.text")}</p>
        <p style={{ color: "var(--sda-danger)" }}>{String(this.state.error)}</p>
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
