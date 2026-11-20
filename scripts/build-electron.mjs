import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

// 主进程与服务端打包成单文件 ESM；node-hid 是原生模块必须保持外部依赖。
await rm('dist-electron', { recursive: true, force: true });
await build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'node-hid'],
  sourcemap: true,
  // Electron 依赖 __dirname 语义，打包成 ESM 时用 banner 补齐。
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirnameOf } from 'node:path';",
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __dirnameOf(__filename);"
    ].join('\n')
  }
});
console.log('electron main bundled -> dist-electron/main.js');
