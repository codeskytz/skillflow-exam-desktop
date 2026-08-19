const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

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

/**
 * Squirrel install/update/uninstall handling.
 *
 * This was the `electron-squirrel-startup` package. Forge's Vite build ships
 * only the bundle — the packaged asar contains no node_modules — and Rollup
 * leaves every `require()` in this CJS main process as an external, so the
 * import survived into the build and resolved to nothing. An installed copy
 * died with "Cannot find module 'electron-squirrel-startup'" before a window
 * ever appeared. Inlined here it cannot go missing; a separate file would not
 * have helped, because a relative require is left external just the same.
 *
 * Squirrel launches the newly installed binary with a flag and expects it to
 * set itself up and exit. The shortcut calls are what put the app in the Start
 * Menu and on the desktop; without them it installs with no way to launch it.
 *
 * @returns {boolean} true when this launch was Squirrel rather than a user.
 */
function handleSquirrelEvent() {
  if (process.platform !== 'win32' || process.argv.length < 2) {
    return false;
  }

  const target = path.basename(process.execPath);

  // Update.exe sits one level above the versioned app-x.y.z directory. The
  // child is detached so it outlives the quit that follows immediately.
  const runUpdate = (args) => {
    try {
      const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
      spawn(updateExe, args, { detached: true });
    } catch {
      // A missing Update.exe must not strand the process; quitting is still
      // the right move, just without shortcuts.
    }
  };

  switch (process.argv[1]) {
    case '--squirrel-install':
    case '--squirrel-updated':
      runUpdate([`--createShortcut=${target}`]);

      return true;

    case '--squirrel-uninstall':
      runUpdate([`--removeShortcut=${target}`]);

      return true;

    // An older version being retired after an update.
    case '--squirrel-obsolete':
      return true;

    default:
      return false;
  }
}

if (handleSquirrelEvent()) {
  app.quit();
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** Whether an exam is currently in progress, which turns the lockdown on. */
let examLocked = false;

const isDev = !app.isPackaged;

/**
 * The platform logo for the window and the taskbar.
 *
 * Windows and macOS take the icon from the packaged executable, so this
 * mainly serves Linux and `npm start`, where the window would otherwise wear
 * the stock Electron logo. Packaged it sits beside the app in resources/;
 * in development main.js runs from .vite/build, two levels below the repo.
 */
function appIcon() {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', '..', 'assets', 'icon.png');

  return fs.existsSync(candidate) ? candidate : undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 680,
    backgroundColor: '#061A30',
    icon: appIcon(),
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

  /*
   * Which renderer to load.
   *
   * Gated on app.isPackaged rather than on the dev-server constant alone.
   * Forge's Vite plugin replaces MAIN_WINDOW_VITE_DEV_SERVER_URL with a literal
   * at build time, and when that literal is the dev server's address the
   * file-loading branch below becomes dead code and is dropped from the bundle
   * entirely. The installed app then had no way to load its own renderer: it
   * pointed at http://localhost:5173 forever, showing whichever Vite project
   * happened to be running on that port and a bare window when none was.
   *
   * app.isPackaged is decided at runtime, so no bundler can fold this away.
   * The typeof guards keep it safe if the constants are not defined at all.
   */
  const devServer =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : null;
  const rendererName = typeof MAIN_WINDOW_VITE_NAME !== 'undefined' ? MAIN_WINDOW_VITE_NAME : 'main_window';

  if (!app.isPackaged && devServer) {
    mainWindow.loadURL(devServer);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${rendererName}/index.html`));
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
  // Without this Windows groups the window under a generic "electron.app"
  // entry on the taskbar and shows its icon instead of ours.
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.skillflow.exam');
  }

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
