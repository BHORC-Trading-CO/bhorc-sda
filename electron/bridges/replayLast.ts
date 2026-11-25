import { ipcRenderer, IpcRendererEvent } from 'electron';

/**
 * Подписка на параметры окна, которая не теряет сообщение, пришедшее раньше подписчика (SDA-66).
 * Main шлёт параметры один раз, через 50 мс после dom-ready, а страница подписывается в эффекте React.
 * На занятом компьютере эффект опаздывал, параметры пропадали, и окно подтверждений или запроса кода
 * оставалось пустым с вечной загрузкой. Preload выполняется до страницы и сообщение не пропустит.
 */
export default function replayLast<T>(channel: string) {
  type Listener = (event: IpcRendererEvent, data: T) => void;
  const listeners = new Set<Listener>();
  // Храним только данные: событие (с ссылкой на ipcRenderer) странице не нужно
  let last: { data: T } | null = null;
  ipcRenderer.on(channel, (event, data: T) => {
    last = { data };
    listeners.forEach((listener) => listener(event, data));
  });
  return (listener: Listener) => {
    listeners.add(listener);
    if (last) listener({} as IpcRendererEvent, last.data);
    return () => { listeners.delete(listener); };
  };
}
