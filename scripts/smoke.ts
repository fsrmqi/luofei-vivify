import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listen } from '../server/server.ts';

const here = dirname(fileURLToPath(import.meta.url));

app.whenReady().then(async () => {
  const publicDir = join(here, '..', 'public');
  const { url } = await listen(0, '127.0.0.1', publicDir);
  const win = new BrowserWindow({ show: true, width: 1360, height: 900 });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('SMOKE console[' + level + '] ' + message);
  });
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, 2500));

  const result = await win.webContents.executeJavaScript(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    // 对话框是否都有统一样式
    const probe = document.createElement('dialog');
    document.body.append(probe);
    probe.showModal();
    const st = getComputedStyle(probe);
    out.dialogRadius = st.borderRadius;
    out.dialogBg = st.backgroundColor;
    out.dialogShadow = st.boxShadow.slice(0, 30);
    probe.close();
    probe.remove();

    // 键帽过渡属性
    const face = document.querySelector('.cap .face');
    out.faceTransition = getComputedStyle(face).transitionProperty;

    // 切层动画
    const bed = document.getElementById('keybed');
    document.querySelectorAll('.tab')[2].click();
    out.layerFlipClass = bed.classList.contains('layer-flip');

    // 选项动画
    const opts = document.getElementById('options');
    [...document.querySelectorAll('.category')].find(b => b.textContent === '媒体').click();
    await sleep(50);
    out.optionsAnimate = opts.classList.contains('animate');
    out.firstOptionDelay = document.querySelector('.option').style.animationDelay;

    out.secondOptionDelay = document.querySelectorAll('.option')[1]?.style.animationDelay;

    // 快捷键 Cmd+Z（先切回基础分类，Esc 在那里）
    [...document.querySelectorAll('.category')].find(b => b.textContent === '基础').click();
    await sleep(50);
    document.querySelector('[aria-label="Caps Lock"]').click();
    const escBtn = [...document.querySelectorAll('.option')].find(b => b.textContent === 'Esc');
    out.foundEsc = Boolean(escBtn);
    escBtn.click();
    await sleep(50);
    out.beforeUndo = document.getElementById('changes').textContent;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true }));
    await sleep(60);
    out.afterCmdZ = document.getElementById('changes').textContent;

    // 确认对话框替代 confirm
    document.getElementById('reset-keyboard').click();
    await sleep(400);
    out.confirmOpen = document.getElementById('confirm-dialog').open;
    out.confirmTitle = document.getElementById('confirm-title').textContent;
    out.confirmOkDanger = document.getElementById('confirm-ok').classList.contains('danger');
    document.getElementById('confirm-cancel').click();
    await sleep(200);
    out.confirmClosed = !document.getElementById('confirm-dialog').open;

    // 配色过渡是否注册成功
    out.keyboardTransition = getComputedStyle(document.getElementById('keyboard')).transitionProperty.includes('--case-light');
    return out;
  })()`);
  console.log('SMOKE_RESULT ' + JSON.stringify(result));
  app.quit();
});
