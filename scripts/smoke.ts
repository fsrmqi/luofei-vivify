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

  const result = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {
      categories: [...document.querySelectorAll('.category')].map(b => b.textContent),
      options: document.querySelectorAll('.option').length,
      caps: document.querySelectorAll('.cap').length,
      hasReset: Boolean(document.getElementById('reset-keyboard')),
      hasRedo: Boolean(document.getElementById('redo')),
      hasHistory: Boolean(document.getElementById('history')),
      hasMacro: Boolean(document.getElementById('macro'))
    };

    // 历史：改一颗键 → 撤销 → 重做
    const capsLock = document.querySelector('[aria-label="Caps Lock"]');
    capsLock.click();
    const escOption = [...document.querySelectorAll('.option')].find(b => b.textContent === 'Esc');
    escOption.click();
    out.pendingAfterEdit = document.getElementById('changes').textContent;
    document.getElementById('undo').click();
    out.afterUndo = document.getElementById('changes').textContent;
    out.redoEnabled = !document.getElementById('redo').disabled;
    document.getElementById('redo').click();
    out.afterRedo = document.getElementById('changes').textContent;

    // 历史对话框
    document.getElementById('history').click();
    out.historyItems = document.querySelectorAll('.history-item').length;
    document.getElementById('history-dialog').close();

    // 宏对话框
    const macroBtn = document.getElementById('macro');
    macroBtn.click();
    await sleep(1200);
    out.macroDialogOpen = document.getElementById('macro-dialog').open;
    out.macroSlots = document.querySelectorAll('#macro-slots .category').length;

    // 录制：模拟 ⌘C，应记录 按下⌘ / C / 抬起⌘
    document.getElementById('macro-record').click();
    const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    fire('MetaLeft', 'keydown');
    fire('KeyC', 'keydown');
    fire('KeyC', 'keyup');
    fire('MetaLeft', 'keyup');
    out.chips = [...document.querySelectorAll('.macro-chip')].map(c => c.textContent);
    out.saveEnabled = !document.getElementById('macro-save').disabled;
    document.getElementById('macro-record').click();

    // 点掉一个 chip 应减少一步
    document.querySelector('.macro-chip')?.click();
    out.chipsAfterRemove = document.querySelectorAll('.macro-chip').length;
    document.getElementById('macro-dialog').close();
    return out;
  })()`);
  console.log('SMOKE_RESULT ' + JSON.stringify(result));
  app.quit();
});
