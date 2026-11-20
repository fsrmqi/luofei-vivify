const capRows = [
  ['esc', 'F1 ☼', 'F2 ☀', 'F3 ▣', 'F4 ⌕', 'F5 ◌', 'F6 ◉', 'F7 ◁', 'F8 ▷Ⅱ', 'F9 ▷', 'F10 ×', 'F11 ◖)', 'F12 ◖))', 'pts ▧', 'del ♙'],
  ['` ~', '1 !', '2 @', '3 #', '4 $', '5 %', '6 ^', '7 &', '8 *', '9 (', '0 )', '- _', '= +', '⟵', 'home'],
  ['tab', ...'QWERTYUIOP', '[ {', '] }', '\\ |', 'end'],
  ['caps', ...'ASDFGHJKL', '; :', '\' "', 'enter', 'pgup'],
  ['shift', ...'ZXCVBNM', ', <', '. >', '/ ?', 'shift', '△', 'pgdn'],
  ['fn', 'ctrl', '⌥', 'command', '', 'command', 'option', 'ctrl', '◁', '▽', '▷']
];
// OE927 Mac 的印字对应的基础层键值，用于标出已经写入的重映射。
const capCodes = [
  [0x29, 0xbe, 0xbd, 0x7e0b, 0x7e0f, 0x7803, 0x7804, 0xac, 0xae, 0xab, 0xa8, 0xaa, 0xa9, 0x7e0d, 0x4c],
  [0x35, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2d, 0x2e, 0x2a, 0x4a],
  [0x2b, 0x14, 0x1a, 8, 0x15, 0x17, 0x1c, 0x18, 0xc, 0x12, 0x13, 0x2f, 0x30, 0x31, 0x4d],
  [0x39, 4, 0x16, 7, 9, 0xa, 0xb, 0xd, 0xe, 0xf, 0x33, 0x34, 0x28, 0x4b],
  [0xe1, 0x1d, 0x1b, 6, 0x19, 5, 0x11, 0x10, 0x36, 0x37, 0x38, 0xe5, 0x52, 0x4e],
  [0x5221, 0xe0, 0xe2, 0xe3, 0x2c, 0xe7, 0xe6, 0xe4, 0x50, 0x51, 0x4f]
];
const physicalNames = {
  '0,0': 'Esc', '0,13': 'Print Screen', '0,14': 'Delete', '1,13': 'Backspace',
  '3,0': 'Caps Lock', '3,13': 'Enter', '4,0': '左 Shift', '4,12': '右 Shift',
  '4,13': '↑', '5,0': 'Fn', '5,1': '左 Control', '5,2': '左 Option', '5,3': '左 Command',
  '5,6': '空格', '5,9': '右 Command', '5,10': '右 Option', '5,11': '右 Control',
  '5,12': '←', '5,13': '↓', '5,14': '→'
};

export const matrixSize = 90;
export const model = '388d:0028';
export const protocol = 12;
export const previewLayerCount = 6;

export function buildLayout(definition) {
  return definition.layouts.keymap.map((row, index) => {
    let x = 0;
    let width = 1;
    let position = 0;
    return row.flatMap(item => {
      if (typeof item === 'object') {
        x += item.x ?? 0;
        width = item.w ?? 1;
        return [];
      }
      const [row, col] = item.split(',').map(Number);
      const legend = capRows[index][position];
      const printedCode = capCodes[index][position++];
      const key = { id: item, row, col, x, width, legend, printedCode, name: physicalNames[item] ?? legend };
      x += width;
      width = 1;
      return key;
    });
  });
}

// 厂商键值说明来自 OE927 Mac 手册与实机键位的对照。
export const deviceBindings = new Map([
  [0x7e01, { short: '蓝牙 1', label: '蓝牙设备 1', hint: '短按切换，长按配对。' }],
  [0x7e02, { short: '蓝牙 2', label: '蓝牙设备 2', hint: '短按切换，长按配对。' }],
  [0x7e03, { short: '蓝牙 3', label: '蓝牙设备 3', hint: '短按切换，长按配对。' }],
  [0x7e04, { short: '2.4G', label: '2.4 GHz 接收器', hint: '按住约 1 秒切换。回连异常时可长按 3 秒重新配对。' }],
  [0x7e0b, { short: '多屏', label: '多屏显示', hint: '根据手册和实机 F3 位置标注。' }],
  [0x7e0f, { short: '搜索', label: '系统搜索', hint: '根据手册和实机 F4 位置标注。' }],
  [0x7e0d, { short: '截图？', label: '截图键的厂商功能', hint: '位于截图键。两层的编码不同，具体截图方式待实按确认。' }],
  [0x7e0e, { short: '截图？', label: '截图键的厂商功能', hint: '位于截图键。两层的编码不同，具体截图方式待实按确认。' }],
  [0x7e0c, { short: '锁屏', label: '锁屏', hint: '根据手册和实机 Delete 位置标注。' }],
  [0x7e12, { short: '背光模式', label: '切换键盘背光模式', hint: '手册标注 Fn + ← / →，可在常亮、呼吸、关闭之间切换。' }],
  [0x7e16, { short: '背光模式', label: '切换键盘背光模式', hint: '手册标注 Fn + ← / →，可在常亮、呼吸、关闭之间切换。' }],
  [0x7e15, { short: '触控开关', label: '侧边触控条开关', hint: '手册标注长按 Fn + 空格 3 秒。' }]
]);

// 键值编号遵循 QMK / VIA 通用约定：0x00–0xA4 与 HID Usage 一致，0xA5 起为 QMK 扩展区间。
// 标签按 macOS 键位习惯书写，aliases 只用于搜索匹配。
export const categories = [
  { id: 'basic', name: '基础' },
  { id: 'media', name: '媒体' },
  { id: 'layer', name: '换层' },
  { id: 'special', name: '特殊' },
  { id: 'numpad', name: '小键盘' },
  { id: 'mouse', name: '鼠标' },
  { id: 'macro', name: '宏' }
];

// 固件实测提供 16 个宏槽位；绑定键值为 0x7700 + 槽位号。
export const macroSlots = 16;

const table = [
  // 基础：控制与编辑
  [0x00, 'basic', '禁用', 'None NO 无功能'],
  [0x01, 'basic', '继承下层', 'Transparent TRNS 透明'],
  [0x29, 'basic', 'Esc', 'Escape 退出'],
  [0x28, 'basic', '回车', 'Enter Return ENT'],
  [0x2b, 'basic', 'Tab', '制表'],
  [0x2c, 'basic', '空格', 'Space SPC'],
  [0x2a, 'basic', '退格', 'Backspace BSPC'],
  [0x4c, 'basic', '删除', 'Delete Del 向后删'],
  [0x39, 'basic', '大写锁定', 'Caps Lock'],
  [0x49, 'basic', '插入', 'Insert Ins'],
  [0x4a, 'basic', 'Home', '起始行首'],
  [0x4d, 'basic', 'End', '末尾行尾'],
  [0x4b, 'basic', 'Page Up', 'PgUp 上翻页'],
  [0x4e, 'basic', 'Page Down', 'PgDn 下翻页'],
  [0x50, 'basic', '←', 'Left 左'],
  [0x4f, 'basic', '→', 'Right 右'],
  [0x51, 'basic', '↓', 'Down 下'],
  [0x52, 'basic', '↑', 'Up 上'],
  [0x46, 'basic', '截图', 'Print Screen PSCR'],
  [0x47, 'basic', '滚动锁定', 'Scroll Lock SLCK'],
  [0x48, 'basic', '暂停', 'Pause PAUS'],
  [0x65, 'basic', '应用程序键', 'Application APP Menu'],
  [0x66, 'basic', '电源键', 'Power 开机'],
  // 基础：修饰键（按 macOS 命名）
  [0xe0, 'basic', '左 Control', 'Left Ctrl LCTL ⌃'],
  [0xe1, 'basic', '左 Shift', 'Left Shift LSFT ⇧'],
  [0xe2, 'basic', '左 Option', 'Left Alt LALT ⌥'],
  [0xe3, 'basic', '左 Command', 'Left GUI LGUI ⌘'],
  [0xe4, 'basic', '右 Control', 'Right Ctrl RCTL'],
  [0xe5, 'basic', '右 Shift', 'Right Shift RSFT'],
  [0xe6, 'basic', '右 Option', 'Right Alt RALT'],
  [0xe7, 'basic', '右 Command', 'Right GUI RGUI'],
  // 媒体
  [0xa5, 'media', '关机', 'Power PWR'],
  [0xa6, 'media', '睡眠', 'Sleep SLEP'],
  [0xa7, 'media', '唤醒', 'Wake WAKE'],
  [0xa8, 'media', '静音', 'Mute MUTE'],
  [0xa9, 'media', '音量增加', 'Volume Up VOLU'],
  [0xaa, 'media', '音量降低', 'Volume Down VOLD'],
  [0xab, 'media', '下一首', 'Next Track MNXT'],
  [0xac, 'media', '上一首', 'Previous Track MPRV'],
  [0xad, 'media', '停止播放', 'Stop MSTP'],
  [0xae, 'media', '播放 / 暂停', 'Play Pause MPLY'],
  [0xaf, 'media', '媒体选择', 'Media Select MSEL'],
  [0xb0, 'media', '弹出', 'Eject EJCT'],
  [0xbb, 'media', '快进', 'Fast Forward MFFD'],
  [0xbc, 'media', '快退', 'Rewind MRWD'],
  [0xbd, 'media', '屏幕亮度增加', 'Brightness Up BRIU'],
  [0xbe, 'media', '屏幕亮度降低', 'Brightness Down BRID'],
  [0xc1, 'media', '控制中心', 'Control Center MCTL'],
  [0xc2, 'media', '启动台', 'Launchpad LPAD'],
  [0xb1, 'media', '邮件', 'Mail MAIL'],
  [0xb2, 'media', '计算器', 'Calculator CALC'],
  [0xb3, 'media', '我的电脑', 'My Computer MYCM'],
  [0xb4, 'media', '浏览器搜索', 'WWW Search'],
  [0xb5, 'media', '浏览器主页', 'WWW Home'],
  [0xb6, 'media', '浏览器后退', 'WWW Back'],
  [0xb7, 'media', '浏览器前进', 'WWW Forward'],
  [0xb8, 'media', '浏览器停止', 'WWW Stop'],
  [0xb9, 'media', '浏览器刷新', 'WWW Refresh'],
  [0xba, 'media', '浏览器收藏', 'WWW Favorites'],
  [0x7803, 'media', '键盘背光降低', 'Backlight Down'],
  [0x7804, 'media', '键盘背光增加', 'Backlight Up'],
  // 特殊：QMK 行为键
  [0x7c16, 'special', '反引号 / Esc 互换', 'Grave Escape GESC'],
  [0x7c11, 'special', '自动大写加强', 'Auto Shift Up'],
  [0x7c10, 'special', '自动大写减弱', 'Auto Shift Down'],
  [0x7c13, 'special', '开启自动大写', 'Auto Shift On'],
  [0x7c14, 'special', '关闭自动大写', 'Auto Shift Off'],
  [0x7c15, 'special', '切换自动大写', 'Auto Shift Toggle'],
  [0x7c1a, 'special', 'Shift 加左括号', 'Shift 9 ('],
  [0x7c1b, 'special', 'Shift 加右括号', 'Shift 0 )'],
  [0x7c1e, 'special', 'Shift 回车', 'Shift Enter'],
  [0x7c18, 'special', 'Control 加左括号', 'Ctrl 9 ('],
  [0x7c19, 'special', 'Control 加右括号', 'Ctrl 0 )'],
  [0x7c1c, 'special', 'Option 加左括号', 'Alt 9 ('],
  [0x7c1d, 'special', 'Option 加右括号', 'Alt 0 )'],
  // 小键盘
  [0x53, 'numpad', 'Num Lock', '数字锁定 NLCK'],
  [0x54, 'numpad', '小键盘 /', 'KP Slash PSLS'],
  [0x55, 'numpad', '小键盘 *', 'KP Asterisk PAST'],
  [0x56, 'numpad', '小键盘 -', 'KP Minus PMNS'],
  [0x57, 'numpad', '小键盘 +', 'KP Plus PPLS'],
  [0x58, 'numpad', '小键盘回车', 'KP Enter PENT'],
  [0x59, 'numpad', '小键盘 1', 'KP 1 P1'],
  [0x5a, 'numpad', '小键盘 2', 'KP 2 P2'],
  [0x5b, 'numpad', '小键盘 3', 'KP 3 P3'],
  [0x5c, 'numpad', '小键盘 4', 'KP 4 P4'],
  [0x5d, 'numpad', '小键盘 5', 'KP 5 P5'],
  [0x5e, 'numpad', '小键盘 6', 'KP 6 P6'],
  [0x5f, 'numpad', '小键盘 7', 'KP 7 P7'],
  [0x60, 'numpad', '小键盘 8', 'KP 8 P8'],
  [0x61, 'numpad', '小键盘 9', 'KP 9 P9'],
  [0x62, 'numpad', '小键盘 0', 'KP 0 P0'],
  [0x63, 'numpad', '小键盘 .', 'KP Dot PDOT'],
  [0x67, 'numpad', '小键盘 =', 'KP Equal PEQL'],
  // 鼠标
  [0xcd, 'mouse', '鼠标上移', 'Mouse Up'],
  [0xce, 'mouse', '鼠标下移', 'Mouse Down'],
  [0xcf, 'mouse', '鼠标左移', 'Mouse Left'],
  [0xd0, 'mouse', '鼠标右移', 'Mouse Right'],
  [0xd1, 'mouse', '鼠标左键', 'Mouse Button 1 单击'],
  [0xd2, 'mouse', '鼠标右键', 'Mouse Button 2'],
  [0xd3, 'mouse', '鼠标中键', 'Mouse Button 3'],
  [0xd4, 'mouse', '鼠标侧键 1', 'Mouse Button 4'],
  [0xd5, 'mouse', '鼠标侧键 2', 'Mouse Button 5'],
  [0xd9, 'mouse', '滚轮上滚', 'Wheel Up'],
  [0xda, 'mouse', '滚轮下滚', 'Wheel Down'],
  [0xdb, 'mouse', '滚轮左滚', 'Wheel Left'],
  [0xdc, 'mouse', '滚轮右滚', 'Wheel Right'],
  [0xdd, 'mouse', '鼠标加速 0', 'Accel 0 慢'],
  [0xde, 'mouse', '鼠标加速 1', 'Accel 1'],
  [0xdf, 'mouse', '鼠标加速 2', 'Accel 2 快']
];

// 字母、数字、符号、功能键按区间批量生成，避免逐条罗列。
for (const [start, legends] of [
  [0x04, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  [0x1e, '1234567890'],
  [0x2d, '-=[]\\'],
  [0x33, ";'`,./"]
]) {
  Array.from(legends).forEach((label, i) => table.push([start + i, 'basic', label, '']));
}
for (let i = 0; i < 12; i++) table.push([0x3a + i, 'basic', 'F' + (i + 1), '']);
for (let i = 0; i < 12; i++) table.push([0x68 + i, 'basic', 'F' + (i + 13), '']);

export const mediaLabels = new Map([
  [0xbd, '亮度＋'], [0xbe, '亮度−'], [0x7803, '背光−'], [0x7804, '背光＋'],
  [0xac, '上一曲'], [0xae, '⏯'], [0xab, '下一曲'], [0xa8, '静音'],
  [0xaa, '音量−'], [0xa9, '音量＋'], [0xc1, '控制中心'], [0xc2, '启动台'],
  [0xbb, '快进'], [0xbc, '快退'], [0xad, '停止'], [0xb0, '弹出'],
  ...Array.from({ length: macroSlots }, (_, i) => [0x7700 + i, '宏' + (i + 1)])
]);

// 层相关键值按下标生成：MO 按住、TO 切换、TG 锁定、OSL 单次、TT 锁存。
const layerFactories = [
  [0x5220, '按住切到层', 'MO', '按住 Fn'],
  [0x5200, '切到层', 'TO', '切换到'],
  [0x5260, '切换层', 'TG', '锁定层'],
  [0x5280, '单次层', 'OSL', '单次'],
  [0x52c0, '层切换锁存', 'TT', '锁存']
];

export function choices(count) {
  const base = table.map(([code, category, label, aliases]) => ({ code, category, label, aliases }));
  const layers = [];
  for (let i = 0; i < count; i++) {
    for (const [offset, label, alias, hint] of layerFactories) {
      layers.push({
        code: offset + i,
        category: 'layer',
        label: label + ' ' + i,
        aliases: alias + '(' + i + ') ' + hint
      });
    }
  }
  const macros = Array.from({ length: macroSlots }, (_, i) => ({
    code: 0x7700 + i,
    category: 'macro',
    label: '宏 ' + (i + 1),
    aliases: 'M' + i + ' MACRO' + (i + 1)
  }));
  return [...base, ...layers, ...macros];
}

export const hex = code => '0x' + code.toString(16).toUpperCase().padStart(4, '0');
export const isCode = code => Number.isInteger(code) && code >= 0 && code <= 65535;
export const cellIndex = ({ row, col }) => row * 15 + col;
export const editId = ({ layer, row, col }) => layer + ':' + row + ',' + col;

export function isSnapshot(snapshot) {
  return snapshot?.model === model && snapshot.protocol === protocol &&
    snapshot.matrix?.rows === 6 && snapshot.matrix.cols === 15 &&
    Array.isArray(snapshot.layers) && snapshot.layers.length >= 1 && snapshot.layers.length <= 32 &&
    snapshot.layers.every(layer => Array.isArray(layer) && layer.length === matrixSize && layer.every(isCode));
}
