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
  await new Promise(resolve => setTimeout(resolve, 2500));

  const result = await win.webContents.executeJavaScript(`(() => {
    const out = {
      title: document.title,
      caps: document.querySelectorAll('.cap').length,
      tabs: document.querySelectorAll('.tab').length,
      categories: [...document.querySelectorAll('.category')].map(b => b.textContent),
      options: document.querySelectorAll('.option').length,
      status: document.getElementById('status')?.textContent ?? null,
      hasTestBtn: Boolean(document.getElementById('key-test'))
    };
    // 切到「媒体」分类看选项是否更新
    const media = [...document.querySelectorAll('.category')].find(b => b.textContent === '媒体');
    media?.click();
    out.mediaOptions = document.querySelectorAll('.option').length;
    out.mediaActive = [...document.querySelectorAll('.category')].find(b => b.textContent === '媒体')?.getAttribute('aria-pressed');
    // 搜索应跨分类
    const search = document.getElementById('search');
    search.value = '音量';
    search.dispatchEvent(new Event('input'));
    out.searchOptions = document.querySelectorAll('.option').length;
    search.value = '';
    search.dispatchEvent(new Event('input'));
    // 进入按键测试，模拟按下 A 与 Caps Lock
    document.getElementById('key-test').click();
    out.testOn = document.getElementById('key-test').getAttribute('aria-pressed');
    const fire = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    fire('KeyA');
    out.pressedAfterA = document.querySelectorAll('.cap.pressed').length;
    out.testedAfterA = document.querySelectorAll('.cap.tested').length;
    out.msgA = document.getElementById('message').textContent;
    fire('CapsLock');
    out.testedAfterCaps = document.querySelectorAll('.cap.tested').length;
    out.msgCaps = document.getElementById('message').textContent;
    document.getElementById('key-test').click();
    out.testOff = document.getElementById('key-test').getAttribute('aria-pressed');
    return out;
  })()`);
  console.log('SMOKE_RESULT ' + JSON.stringify(result));
  app.quit();
});
