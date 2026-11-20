# luofei-vivify

洛斐小顺 Flow 2（OE927 Mac，`388d:0028`）的键位编辑器。在本地页面里查看键盘当前的配置、改键位并写回键盘，也可以打包成 macOS 桌面应用。

## 运行方式

需要 Node.js 22.18 或更新版本。

### 桌面应用（推荐）

```sh
pnpm install
pnpm dev          # 开发态直接开窗口
pnpm package      # 打包出 dist/*.dmg
```

### 命令行 + 浏览器

```sh
pnpm install
pnpm start        # 打开 http://127.0.0.1:4312
```

两种方式都需要把键盘切到有线模式并直连 USB。

## 结构

| 路径 | 作用 |
| --- | --- |
| `server/server.ts` | 本地 HTTP 服务，静态页面 + 会话/状态/读写接口 |
| `server/via.ts` | VIA 协议 12 实现，经 `node-hid` 收发 |
| `public/` | 前端页面，原生 ES module，无构建步骤 |
| `electron/main.ts` | 桌面应用主进程，起服务后开窗口 |
| `scripts/build-electron.mjs` | esbuild 打包主进程为单文件 |
| `scripts/smoke.ts` | 端到端冒烟，校验渲染后的键位数与图层 |
| `electron-builder.yml` | macOS arm64 DMG 打包配置 |

## 打包说明

- `node-hid` 是 N-API 原生模块，通过 `asarUnpack` 解包到 `app.asar` 之外才能加载。
- 当前为未签名构建（`identity: null`），本地自用足够。对外分发需补签名与公证。
- 服务只监听回环地址且端口随机，窗口加载后即用。

## 能力范围

支持键位与层的查看、修改、撤销、写入回读，以及快照导出恢复。Fn 组合键、厂商自定义键值、触控条、灯光与宏单独核对固件能力后再决定是否纳入。

## 许可

参考了 [the-via/app](https://github.com/the-via/app)（GPL-3.0）的协议实现思路，未直接复用其代码。
