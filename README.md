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

首次打开如果提示「无法验证该 App」：应用为 ad-hoc 签名、未经 Apple 公证，属于本地自建产物的正常情况。在「系统设置 → 隐私与安全性」里点「仍要打开」，或执行：

```sh
xattr -dr com.apple.quarantine "/Applications/Flow 2 Keymap.app"
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

- 键位与层的查看、修改、撤销、写入回读，快照导出恢复。
- 209 个可绑定键值，分基础、媒体、换层、特殊、小键盘、鼠标六类，搜索可跨类匹配。
- 按键测试：按下物理键，页面标出它实际落在哪颗键上，用来核对重映射是否生效。

## 固件能力实测

用 `scripts/probe-capabilities.mjs` 探测结果（`node scripts/probe-capabilities.mjs`）：

| 项目 | 结果 |
| --- | --- |
| VIA 协议 | 12 |
| 层数 | 6 |
| 宏槽位 | 16（缓冲区 2976 字节，尚未接入界面） |
| 键盘值查询（UPTIME / 布局选项 / 矩阵状态 / 固件版本 / 背光 / RGB） | 均不支持 |

因此灯光、厂商自定义菜单、固件矩阵状态读取在这块固件上不可行；宏是硬件已支持但尚未实现的部分。

## 图标

`build/icon.png` 与 `build/icon.icns` 由 `scripts/make-icon.py` 生成，改配色或形状后重新执行该脚本并用 `iconutil` 重新打包即可。

## 许可

参考了 [the-via/app](https://github.com/the-via/app)（GPL-3.0）的协议实现思路，未直接复用其代码。键值编号采用 QMK / VIA 的通用编号约定。
