const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('node:path');
const started = require('electron-squirrel-startup');

/**
 * Skillflow Exam — desktop shell.
 *
 * The renderer is the same exam flow the mobile app runs. What the desktop adds
 * is the part a phone gets from the operating system: while an exam is open the
 * window becomes hard to leave, hard to capture and hard to inspect, and the
 * moment a student does leave it the renderer is told so it can auto-submit —
 * the desktop equivalent of the mobile app's AppState listener and
 * react-native-secure-window.
 *
 * None of this is unbeatable. A second machine or a phone camera defeats any of
 * it. The aim is that leaving the exam is deliberate, visible, and recorded.
 */

// Squirrel runs the app during install/uninstall; quit immediately if so.
if (started) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** Whether an exam is currently in progress, which turns the lockdown on. */
let examLocked = false;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: '#061A30',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // The renderer is untrusted UI code; it reaches the shell only through
      // the narrow surface preload exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Stops a compromised renderer opening a file:// or devtools window.
      webviewTag: false,
      spellcheck: false,
    },
  });

  // Avoids the white flash before the first paint, which looks broken on the
  // dark navy the app uses throughout.
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  /*
   * Leaving the exam window is the event the exam cares about. On mobile this
   * is AppState going inactive; here it is the window losing focus, which
   * covers alt-tab, clicking another app, and switching virtual desktop.
   */
  mainWindow.on('blur', () => {
    if (examLocked) {
      mainWindow?.webContents.send('exam:left-window', { reason: 'blur' });
    }
  });

  mainWindow.on('minimize', () => {
    if (examLocked) {
      mainWindow?.webContents.send('exam:left-window', { reason: 'minimize' });
    }
  });

  // Closing mid-exam is refused; the renderer is asked to confirm instead, so
  // a stray Alt+F4 cannot discard a paper silently.
  mainWindow.on('close', (event) => {
    if (examLocked) {
      event.preventDefault();
      mainWindow?.webContents.send('exam:close-requested');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Nothing in this app should ever open a second window or navigate away.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
}

/**
 * Turn the exam lockdown on or off.
 *
 * Kiosk mode is what actually keeps the window in front. The shortcut
 * registrations are a deterrent layer on top: they only bind while the app has
 * focus, so they stop the reflexive keystrokes rather than a determined user.
 */
function setExamLock(locked) {
  examLocked = locked;

  if (!mainWindow) return;

  mainWindow.setKiosk(locked);
  mainWindow.setAlwaysOnTop(locked, 'screen-saver');

  // Excludes the window from screen capture where the OS supports it —
  // the desktop counterpart of react-native-secure-window.
  mainWindow.setContentProtection(locked);

  if (locked) {
    mainWindow.focus();

    // Refresh and devtools would both let a student around the exam UI.
    for (const accelerator of ['CommandOrControl+R', 'CommandOrControl+Shift+R', 'F5']) {
      globalShortcut.register(accelerator, () => {});
    }
    if (!isDev) {
      for (const accelerator of ['CommandOrControl+Shift+I', 'CommandOrControl+Shift+J', 'F12']) {
        globalShortcut.register(accelerator, () => {});
      }
    }
  } else {
    globalShortcut.unregisterAll();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

/*
 * IPC. Deliberately tiny: the renderer can start and end the lockdown, ask to
 * really close, and read the configured API base. Nothing else crosses.
 */

ipcMain.handle('exam:lock', () => {
  setExamLock(true);

  return true;
});

ipcMain.handle('exam:unlock', () => {
  setExamLock(false);

  return true;
});

/** Called once the renderer has finished submitting and genuinely wants out. */
ipcMain.handle('exam:force-close', () => {
  setExamLock(false);
  mainWindow?.close();

  return true;
});

ipcMain.handle('shell:quit-confirm', async () => {
  if (!mainWindow) return false;

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Stay in the exam', 'Submit and quit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Leave the exam?',
    message: 'You are in the middle of an exam.',
    detail: 'Quitting now submits the answers you have given so far. This cannot be undone.',
  });

  return response === 1;
});

/**
 * The API base, supplied at build or run time rather than compiled in, so the
 * same build points at staging or production without a rebuild.
 */
ipcMain.handle('config:api-base', () => {
  if (process.env.SKILLFLOW_API_URL) {
    return process.env.SKILLFLOW_API_URL;
  }

  /*
   * Development talks to the local API, production to the real one.
   *
   * This used to default to production in both cases, which meant `npm start`
   * silently tested against the deployed server: local backend changes appeared
   * to do nothing, and the app returned messages from code that was not on this
   * machine. Set SKILLFLOW_API_URL to override either way.
   */
  return isDev ? 'http://127.0.0.1:8000/api/v1' : 'https://api.skillflowtz.com/api/v1';
});

ipcMain.handle('config:app-version', () => app.getVersion());
