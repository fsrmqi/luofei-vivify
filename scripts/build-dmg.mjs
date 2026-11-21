import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import metadata from '../package.json' with { type: 'json' };

// electron-builder 的 DMG 目标在本机会卡在 dmgbuild 解包，改用 --dir + 系统工具生成。
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('请在 Apple Silicon Mac 上使用 arm64 Node.js 构建 DMG。');
}
const name = 'Flow 2 Keymap';
const { version } = metadata;
const appPath = join('dist', 'mac-arm64', `${name}.app`);
const stage = join('dist', 'dmg-stage');
const dmgPath = join('dist', `${name}-${version}-arm64.dmg`);

console.log('[dmg] 1/4 打包 .app');
execFileSync(join('node_modules', '.bin', 'electron-builder'), ['--mac', '--arm64', '--dir', '--publish', 'never', '-c.electronDist=node_modules/electron/dist'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
});

// electron-builder 在 identity 为 null 时完全不签名，而 Apple Silicon 要求 App 至少有
// ad-hoc 签名，否则 Gatekeeper 报「无法验证该 App」。这里补一次 ad-hoc 签名。
console.log('[dmg] 2/4 ad-hoc 签名');
execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });

console.log('[dmg] 3/4 准备挂载内容');
await rm(stage, { recursive: true, force: true });
await rm(dmgPath, { force: true });
await mkdir(stage, { recursive: true });
await cp(appPath, join(stage, `${name}.app`), { recursive: true, verbatimSymlinks: true });
// 拖拽安装到「应用程序」的快捷方式。
await symlink('/Applications', join(stage, 'Applications'));

console.log('[dmg] 4/4 生成 DMG');
// hdiutil create 在本机会报「资源忙」，改用 diskutil image create。
execFileSync('diskutil', ['image', 'create', 'from', '--format', 'UDZO', '--volumeName', name, stage, dmgPath], {
  stdio: 'inherit'
});
await rm(stage, { recursive: true, force: true });
console.log(`[dmg] 完成 ${dmgPath}`);
