import { app, BrowserWindow, dialog, shell } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { listen } from '../server/server.ts';

let window: BrowserWindow | null = null;

/** 定位 public 目录：打包后在 app.asar 内，开发态在仓库根或入口同级。 */
function resolvePublicDir(): string {
  const candidates = [join(app.getAppPath(), 'public'), join(__dirname, '..', 'public'), join(__dirname, 'public')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`找不到 public 目录，已尝试：${candidates.join(', ')}`);
}

async function createWindow() {
  // 开发态 public/ 在仓库根，打包后在 app.asar 内；入口文件位置不同，逐级回退。
  const publicDir = resolvePublicDir();
  const { url } = await listen(0, '127.0.0.1', publicDir);
  console.log(`[vivify] 本地服务已启动 ${url}`);

  window = new BrowserWindow({
    title: 'Flow 2 键位编辑器',
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 720,
    backgroundColor: '#e9e6e1',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });

  // 页面内的外部链接交给系统浏览器，窗口本身不跳转。
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http://') || target.startsWith('https://')) void shell.openExternal(target);
    return { action: 'deny' };
  });
  // 阻止页面被导航到本地服务之外的地址。
  const origin = new URL(url).origin;
  window.webContents.on('will-navigate', (event, target) => {
    try {
      if (new URL(target).origin !== origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  await window.loadURL(url);
}

// 单实例：第二个实例聚焦已有窗口。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(createWindow).catch(error => {
    dialog.showErrorBox('Flow 2 键位编辑器启动失败', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
