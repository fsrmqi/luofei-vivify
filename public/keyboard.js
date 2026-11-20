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

const basics = [
  [0x29, 'Esc', '退出'], [0xe3, '左 Command', '⌘ GUI CMD'], [0xe2, '左 Option', '⌥ ALT'],
  [0xa8, '静音', 'Mute'], [0x39, 'Caps Lock', '大写锁定'], [0x2c, '空格', 'Space'],
  [0x28, 'Enter', '回车 Return'], [0x2a, 'Backspace', '退格'], [0x2b, 'Tab', '制表'],
  [0x4c, 'Delete', '删除'], [0x49, 'Insert'], [0x4a, 'Home'], [0x4d, 'End'],
  [0x4b, 'Page Up', 'PgUp'], [0x4e, 'Page Down', 'PgDn'],
  [0x4f, '→', '右 Right'], [0x50, '←', '左 Left'], [0x51, '↓', '下 Down'], [0x52, '↑', '上 Up'],
  [0xe0, '左 Control', '⌃ Ctrl'], [0xe1, '左 Shift', '⇧'], [0xe4, '右 Control', '⌃ Ctrl'],
  [0xe5, '右 Shift', '⇧'], [0xe6, '右 Option', '⌥ ALT'], [0xe7, '右 Command', '⌘ GUI CMD'],
  [0x46, 'Print Screen', '截图'], [0xa9, '音量增加', 'Volume Up'], [0xaa, '音量降低', 'Volume Down'],
  [0xab, '下一首', '下一曲 Next'], [0xac, '上一首', '上一曲 Previous'], [0xae, '播放 / 暂停', '播放暂停 Play Pause'],
  [0xbd, '屏幕亮度增加', 'Brightness Up'], [0xbe, '屏幕亮度降低', 'Brightness Down'],
  [0x7803, '键盘背光降低', '背光降暗 Backlight Down'], [0x7804, '键盘背光增加', '背光加亮 Backlight Up'],
  [1, '继承下层', '透明 Transparent TRNS'], [0, '禁用', '无功能 None']
];
for (const [start, legends] of [[4, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], [0x1e, '1234567890'],
  [0x2d, '-=[]\\'], [0x33, ";'`,./"]]) {
  Array.from(legends).forEach((label, i) => basics.push([start + i, label]));
}
for (let i = 0; i < 12; i++) basics.push([0x3a + i, `F${i + 1}`]);

export const mediaLabels = new Map([
  [0xbd, '亮度＋'], [0xbe, '亮度−'], [0x7803, '背光−'], [0x7804, '背光＋'],
  [0xac, '上一曲'], [0xae, '⏯'], [0xab, '下一曲'], [0xa8, '静音'],
  [0xaa, '音量−'], [0xa9, '音量＋']
]);

export function choices(count) {
  const layers = Array.from({ length: count }, (_, i) => [0x5220 + i, `按住切到层 ${i}`, `MO(${i}) Fn`]);
  return [...basics, ...layers].map(([code, label, aliases]) => ({ code, label, aliases: aliases ?? '' }));
}

export const hex = code => `0x${code.toString(16).toUpperCase().padStart(4, '0')}`;
export const isCode = code => Number.isInteger(code) && code >= 0 && code <= 65535;
export const cellIndex = ({ row, col }) => row * 15 + col;
export const editId = ({ layer, row, col }) => `${layer}:${row},${col}`;

export function isSnapshot(snapshot) {
  return snapshot?.model === model && snapshot.protocol === protocol &&
    snapshot.matrix?.rows === 6 && snapshot.matrix.cols === 15 &&
    Array.isArray(snapshot.layers) && snapshot.layers.length >= 1 && snapshot.layers.length <= 32 &&
    snapshot.layers.every(layer => Array.isArray(layer) && layer.length === matrixSize && layer.every(isCode));
}
