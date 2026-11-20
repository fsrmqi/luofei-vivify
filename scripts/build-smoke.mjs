import { build } from 'esbuild';

// 冒烟脚本：打包后在无界面窗口里加载页面，校验渲染结果。
await build({
  entryPoints: ['scripts/smoke.ts'],
  outfile: 'dist-electron/smoke.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'node-hid'],
  logLevel: 'error'
});
console.log('smoke bundled -> dist-electron/smoke.js');
