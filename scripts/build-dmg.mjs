import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';

// electron-builder 的 DMG 目标在本机会卡在 dmgbuild 解包，改用 --dir + 系统工具生成。
const name = 'Flow 2 Keymap';
const version = '0.1.0';
const appPath = join('dist', 'mac-arm64', `${name}.app`);
const stage = join('dist', 'dmg-stage');
const dmgPath = join('dist', `${name}-${version}-arm64.dmg`);

console.log('[dmg] 1/3 打包 .app');
execFileSync(join('node_modules', '.bin', 'electron-builder'), ['--mac', '--arm64', '--dir'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
});

console.log('[dmg] 2/3 准备挂载内容');
await rm(stage, { recursive: true, force: true });
await rm(dmgPath, { force: true });
await mkdir(stage, { recursive: true });
await cp(appPath, join(stage, `${name}.app`), { recursive: true, verbatimSymlinks: true });
// 拖拽安装到「应用程序」的快捷方式。
await symlink('/Applications', join(stage, 'Applications'));

console.log('[dmg] 3/3 生成 DMG');
// hdiutil create 在本机会报「资源忙」，改用 diskutil image create。
execFileSync('diskutil', ['image', 'create', 'from', '--format', 'UDZO', '--volumeName', name, stage, dmgPath], {
  stdio: 'inherit'
});
await rm(stage, { recursive: true, force: true });
console.log(`[dmg] 完成 ${dmgPath}`);
