import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listen } from '../server/server.ts';

const here = dirname(fileURLToPath(import.meta.url));

app.whenReady().then(async () => {
  // 冒烟脚本产物在 dist-electron/，public 在仓库根。
  const publicDir = join(here, '..', 'public');
  const { url } = await listen(0, '127.0.0.1', publicDir);
  console.log('SMOKE url=' + url + ' public=' + publicDir);

  const win = new BrowserWindow({ show: false, width: 1360, height: 900 });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('SMOKE console[' + level + '] ' + message);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, target) => {
    console.log('SMOKE did-fail-load ' + code + ' ' + desc + ' ' + target);
  });
  await win.loadURL(url);
  await new Promise(resolve => setTimeout(resolve, 2500));

  const result = await win.webContents.executeJavaScript(`({
    title: document.title,
    caps: document.querySelectorAll('.cap').length,
    rows: document.querySelectorAll('.key-row').length,
    tabs: document.querySelectorAll('.tab').length,
    options: document.querySelectorAll('.option').length,
    status: document.getElementById('status')?.textContent ?? null,
    layerNote: document.getElementById('layer-note')?.textContent ?? null,
    changes: document.getElementById('changes')?.textContent ?? null,
    firstCap: document.querySelector('.cap')?.textContent ?? null,
    capsLockTitle: document.querySelector('[aria-label="Caps Lock"]')?.title ?? null
  })`);
  console.log('SMOKE_RESULT ' + JSON.stringify(result));
  app.quit();
});
