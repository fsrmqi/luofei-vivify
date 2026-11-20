# luofei-vivify

Unofficial local keymap editor for the Lofree Flow 2 (洛斐小顺 Flow 2, OE927 Mac, 84-key, USB `388d:0028`). It reads the current layout over wired VIA HID, edits keys on a local page, and writes the changes back. It is not Lofree's official software.

洛斐小顺 Flow 2（OE927 Mac，84 键）的非官方本地键位编辑器。通过有线 USB 上的 VIA HID 读取当前布局，在本机页面里改键，再把改动写回键盘。与洛斐官方软件无关。

## 环境

- Node.js 22.18 或更高。`package.json` 的 `engines` 如此要求；`pnpm start` 会用 Node 直接运行 `server/server.ts`。
- 当前按 macOS 使用。打包目标只有 Apple Silicon（arm64）。
- 配置时把键盘拨到有线档，并用 USB 数据线直连。蓝牙和 2.4 GHz 是日常输入方式；这个工具只在有线 USB 下通信。

## 本地网页

仓库带有 `pnpm-lock.yaml`。下面用 pnpm；相同的脚本名也可以交给 npm。

```sh
pnpm install
pnpm start
```

```sh
npm install
npm start
```

然后在浏览器打开 <http://127.0.0.1:4312>。端口来自环境变量 `VIVIFY_PORT`，未设置时是 4312。命令行模式只监听 `127.0.0.1`。

## macOS 桌面应用

```sh
pnpm install
pnpm dev       # 编译主进程后直接开窗口
pnpm package   # 打出 arm64 的 .app 和 DMG
```

`pnpm package` 先运行 `scripts/build-electron.mjs`，再由 `scripts/build-dmg.mjs` 执行 `electron-builder --mac --arm64 --dir`，做 ad-hoc 签名，并用 `diskutil` 生成：

- `dist/mac-arm64/Flow 2 Keymap.app`
- `dist/Flow 2 Keymap-0.1.0-arm64.dmg`

`electron-builder.yml` 里的 macOS 目标也只有 arm64 DMG。应用图标是 `build/icon.icns`。`node-hid` 是原生模块，配置里用 `asarUnpack` 把它放在 asar 包外加载。窗口加载的是本机回环地址，端口由系统分配，与上面的 4312 无关。

另外两个脚本：`pnpm check` 做类型检查；`pnpm smoke` 在无界面窗口里核对渲染出的键位数、图层、分类和按键测试标记。

`scripts/make-icon.py` 会写出 `build/icon.png`。打包实际使用的是已经放在仓库里的 `build/icon.icns`。

## 第一次连接

1. 插上 USB 数据线，把键盘从蓝牙或 2.4 GHz 拨到有线档。
2. 同时只连接一把这个型号的键盘。检测到多把时，程序会停下来并提示只留一把。
3. macOS 可能会向终端里的 Node，或向打包后的「Flow 2 Keymap」，询问是否允许访问 HID 或输入设备。一直检测不到键盘时，到「系统设置 → 隐私与安全性」查看当前程序是否被拦截。
4. `pnpm package` 打出的应用经过 ad-hoc 签名，没有 Apple 公证。若系统提示无法验证该 App，可在「系统设置 → 隐私与安全性」里选择仍要打开。拖进「应用程序」之后也可以执行：

```sh
xattr -dr com.apple.quarantine "/Applications/Flow 2 Keymap.app"
```

## 现在能做的

- 检测有线键盘，读取 VIA 协议版本、层数和整张键位。固件返回的协议版本必须是 12。
- 在基础层、功能层，以及键盘返回的后续编号层之间切换。尚未连上键盘时，页面用 6 层做本地预览；连上之后以设备报告的层数为准。
- 可绑定键值分成基础、媒体、换层、特殊、小键盘、鼠标六类，编号沿用 QMK / VIA 的通用约定。设备报告 6 层时一共 209 个：固定键值 179 个，换层键按层生成（按住、切换、锁定、单次、锁存，每层 5 个）。侧栏按分类浏览，搜索跨全部分类。
- 改键先显示为草稿，键帽上能看到预览。
- 「按键测试」对照当前层已经读到的键位：按下键盘后，页面标出输出该键值的物理键，用来核对已经写入的重映射。对不上时提示未映射键。这是页面收到的按键，不是固件矩阵扫描。
- 撤销当前页面会话里尚未写入的草稿操作。重新读取键盘、写入结束或刷新页面后，撤销记录清空。
- 写入时逐键回读。中途失败时，已经回读确认的键留在设备上，其余草稿留在页面里。
- 重新连接后，如果设备上的键值和草稿依据的旧值不一致，对应的键会标成冲突。可以改用设备当前值，或保留自己的修改后再写。
- 草稿、最近一次读到的键位和配色写在页面本地存储里（键名 `vivify.oe927.v1`）。网页固定在 `127.0.0.1:4312` 时，下次打开同一地址可以恢复。桌面应用每次启动分配新的回环端口，关闭窗口后这份存储不会被下一次启动读到。
- 导出、导入 JSON 快照。导出的是内存里最近一次与键盘核对过的键位，不包含还没写入的草稿。导入把快照和当前读数的差异放进草稿，还要点「写入键盘」才会写回。
- 四种外观：银色、星云蓝、花瓣粉、电光黄。只改变页面上的键盘颜色。
- 「设备用法」说明侧边触控条、键盘背光、无线连接和恢复出厂的按键方式。对话框只提供这些说明。

## 目前的限度

- 一部分厂商键值仍以十六进制显示。截图键的厂商编码在界面上标为待实按确认；没有对应名称的键会显示「自定义」或「原始键值，具体功能待确认」。
- 第 2 层及以后各层实际做什么，以及有线写入之后切回蓝牙或 2.4 GHz 时键位是否仍然有效，都还需要更多实机核对。
- 固件探测看到 16 个宏槽位，应用里没有宏编辑界面。
- 灯光和触控条没有设置界面。探测也没有得到可用的背光或矩阵状态控制。恢复出厂按帮助里的组合键在键盘上操作。

有线连接键盘后可以再跑一次探测：

```sh
node scripts/probe-capabilities.mjs
```

已有的实机记录：

| 项目 | 结果 |
| --- | --- |
| VIA 协议 | 12 |
| 层数 | 6 |
| 宏槽位 | 16（缓冲区 2976 字节） |
| 键盘值查询（运行时间、布局选项、矩阵状态、固件版本、背光、RGB） | 没有可用结果 |

## 容器

`Dockerfile` 与 `compose.yaml` 只适合把页面放到容器里。`VIVIFY_CONTAINER=1` 时进程不打开 HID，而是把接口转发到 `http://host.docker.internal:4312`（Docker Desktop、OrbStack 一类环境提供这个主机名）。键盘通信仍要在 macOS 宿主机上先运行 `pnpm start`。

`compose.yaml` 发布 `127.0.0.1:4313` 到容器的 4313。服务默认监听 `VIVIFY_PORT`，未设置时是 4312。日常改键直接用上面的 macOS 命令。

## 许可

本仓库以 [MIT License](LICENSE) 发布，版权人 cuijiaqi，2026。与 VIA 协议兼容使用的是公开的命令号、报文格式和 QMK / VIA 键值编号，不包含 [the-via/app](https://github.com/the-via/app)（GPL-3.0）的源代码。`node-hid`、Electron 等依赖仍适用它们各自的许可证。

`package.json` 的 `"private": true` 只表示不发布到 npm。

非官方工具。写入会修改键盘中的键位。软件按「原样」提供，不提供任何保证。
