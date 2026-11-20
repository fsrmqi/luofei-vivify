import HID from 'node-hid';
import { readFileSync, writeFileSync } from 'node:fs';

// 把键盘当前的完整键位抓成默认值文件，用于「重置键盘」。
// 前提是键盘处于出厂状态；跑前先用 scripts/check-factory.mjs 确认。
const definition = JSON.parse(readFileSync(new URL('../public/oe927-mac.json', import.meta.url)));
const { rows, cols } = definition.matrix;
const cells = rows * cols;

const dev = (await HID.devicesAsync()).find(d =>
  d.vendorId === 0x388d && d.productId === 0x0028 && d.usagePage === 0xff60 && d.usage === 0x61 && d.path);
if (!dev) { console.log('键盘未连接'); process.exit(1); }
const hid = new HID.HID(dev.path);

function exchange(command, args = [], echo = args.length) {
  const packet = Buffer.alloc(33);
  packet[1] = command;
  packet.set(args, 2);
  hid.write(packet);
  const reply = hid.readTimeout(800);
  if (!reply || !reply.length) throw new Error('超时');
  return Buffer.from(reply);
}

const protocol = exchange(0x01).readUInt16BE(1);
const count = exchange(0x11)[1];
const layers = [];
for (let layer = 0; layer < count; layer++) {
  const values = [];
  for (let index = 0; index < cells; index += 14) {
    const offset = (layer * cells + index) * 2;
    const size = Math.min(14, cells - index) * 2;
    const bytes = exchange(0x12, [offset >> 8, offset & 255, size], 3);
    for (let i = 4; i < size + 4; i += 2) values.push(bytes.readUInt16BE(i));
  }
  layers.push(values);
}
hid.close();

const snapshot = {
  model: '388d:0028',
  protocol,
  matrix: { rows, cols },
  layers
};
writeFileSync(new URL('../data/oe927-default-keymap.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.log('已写入 data/oe927-default-keymap.json，层数', layers.length, '每层', layers[0].length, '字节');
