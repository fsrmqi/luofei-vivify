import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listen } from '../server/server.ts';

const here = dirname(fileURLToPath(import.meta.url));

app.whenReady().then(async () => {
  const publicDir = join(here, '..', 'public');
  const { url } = await listen(0, '127.0.0.1', publicDir);
  const win = new BrowserWindow({ show: false, width: 1360, height: 900 });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('SMOKE console[' + level + '] ' + message);
  });
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, 2500));

  const phase1 = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const search = document.getElementById('search');
    const type = async q => {
      search.value = q;
      search.dispatchEvent(new Event('input'));
      await sleep(40);
      return [...document.querySelectorAll('.option')].map(b => b.textContent);
    };

    // 1. 模糊搜索
    out.cmd = (await type('cmd')).slice(0, 3);
    out.opt = (await type('opt')).slice(0, 2);
    out.ctrl = (await type('ctrl')).slice(0, 2);
    out.subsequence = (await type('bksp')).slice(0, 2);
    out.chinese = (await type('音量')).slice(0, 2);
    out.hex = (await type('0x29')).slice(0, 2);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    await sleep(40);

    // 2. 层记忆：切到层 3 并保存
    document.querySelectorAll('.tab')[3].click();
    await sleep(120);
    out.activeTab = [...document.querySelectorAll('.tab')].findIndex(t => t.getAttribute('aria-pressed') === 'true');
    out.storedLayer = JSON.parse(localStorage.getItem('vivify.oe927.v1') || '{}').layer;

    // 3. 冲突定位按钮默认隐藏
    out.jumpHidden = document.getElementById('jump-conflict').hidden;

    // 4. 导出快照应包含宏
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    let captured = null;
    URL.createObjectURL = blob => { captured = blob; return 'blob:smoke'; };
    HTMLAnchorElement.prototype.click = function () {};
    document.getElementById('export').click();
    await sleep(1200);
    URL.createObjectURL = origCreate;
    HTMLAnchorElement.prototype.click = origClick;
    if (captured) {
      const payload = JSON.parse(await captured.text());
      out.exportHasMacros = Boolean(payload.macros);
      out.exportMacroCount = payload.macros?.count;
      out.exportHasLayers = Array.isArray(payload.layers) && payload.layers.length === 6;
    }
    out.exportMessage = document.getElementById('message').textContent;
    return out;
  })()`);

  // 5. 重开一个窗口验证层记忆（同 session 共享 localStorage）
  const win2 = new BrowserWindow({ show: false, width: 1360, height: 900 });
  await win2.loadURL(url);
  await new Promise(r => setTimeout(r, 2200));
  const phase2 = await win2.webContents.executeJavaScript(`(() => ({
    activeTab: [...document.querySelectorAll('.tab')].findIndex(t => t.getAttribute('aria-pressed') === 'true'),
    selectedKey: document.getElementById('physical').textContent
  }))()`);

  console.log('SMOKE_RESULT ' + JSON.stringify({ ...phase1, reload: phase2 }));
  app.quit();
});
