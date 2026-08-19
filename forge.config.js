const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('node:path');

/*
 * The platform icon, built from assets/icon-source.png by `npm run icons`.
 * Given without an extension because packager appends the one each platform
 * wants: .ico on Windows, .icns on macOS, the .png on Linux. Without this the
 * installer, the shortcut and the taskbar all showed the stock Electron logo.
 */
const ICON = path.join(__dirname, 'assets', 'icon');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: ICON,
    name: 'Skillflow Exam',
    executableName: process.platform === 'linux' ? 'skillflow-exam' : 'Skillflow Exam',
    appCategoryType: 'public.app-category.education',
    // Also shipped loose so the main process can hand it to BrowserWindow,
    // which is what puts the logo on the window and taskbar under Linux.
    extraResource: [path.join(__dirname, 'assets', 'icon.png')],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        // The .ico the installer itself wears, and the one Windows shows in
        // Add/Remove Programs — Squirrel reads that one over the network, so
        // it has to be a URL rather than a local path.
        setupIcon: path.join(__dirname, 'assets', 'icon.ico'),
        iconUrl: 'https://skillflowtz.com/assets/logo.png',
        name: 'skillflow_exam',
        setupExe: 'Skillflow-Exam-Setup.exe',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: path.join(__dirname, 'assets', 'icon.png'),
          categories: ['Education'],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: path.join(__dirname, 'assets', 'icon.png'),
          categories: ['Education'],
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
