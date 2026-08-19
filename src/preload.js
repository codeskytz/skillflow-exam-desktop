const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the exam UI and the desktop shell.
 *
 * Everything is an explicit method — no ipcRenderer, no require, no Node — so a
 * bug or an injected script in the renderer cannot reach the file system or
 * spawn anything.
 */
contextBridge.exposeInMainWorld('examShell', {
  /** True when running inside the desktop app rather than a plain browser. */
  isDesktop: true,

  /** Where the API lives, resolved by the main process. */
  getApiBase: () => ipcRenderer.invoke('config:api-base'),

  getAppVersion: () => ipcRenderer.invoke('config:app-version'),

  /**
   * Open the download page in the system browser.
   *
   * The renderer cannot navigate anywhere and cannot open windows, which is
   * what keeps an exam in its own box. So the one link the update screen needs
   * goes through the shell, where the main process checks it before opening.
   */
  openDownloadPage: (url) => ipcRenderer.invoke('shell:open-download', url),

  /** Kiosk, always-on-top and capture protection, for the duration of a paper. */
  lockForExam: () => ipcRenderer.invoke('exam:lock'),
  unlockAfterExam: () => ipcRenderer.invoke('exam:unlock'),

  /** Used once submission has finished and the window may genuinely close. */
  forceClose: () => ipcRenderer.invoke('exam:force-close'),

  /** Native confirm shown when someone tries to quit mid-paper. */
  confirmQuit: () => ipcRenderer.invoke('shell:quit-confirm'),

  /**
   * Fires when the student leaves the exam window — alt-tab, minimise, another
   * app. The renderer decides what that means, which for an exam with
   * auto_submit_on_leave is an immediate submission.
   *
   * Returns an unsubscribe function so screens can clean up on unmount.
   */
  onLeftWindow: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('exam:left-window', listener);

    return () => ipcRenderer.removeListener('exam:left-window', listener);
  },

  /** Fires when the OS asked the window to close during an exam. */
  onCloseRequested: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('exam:close-requested', listener);

    return () => ipcRenderer.removeListener('exam:close-requested', listener);
  },
});
