import HID from 'node-hid';
import { buildLayout } from '../public/keyboard.js';
import { readFileSync } from 'node:fs';

const definition = JSON.parse(readFileSync(new URL('../public/oe927-layout.json', import.meta.url)));
const layout = buildLayout(definition).flat();
const { rows, cols } = definition.matrix;
const cells = rows * cols;

const dev = (await HID.devicesAsync()).find(d =>
  d.vendorId === 0x388d && d.productId === 0x0028 && d.usagePage === 0xff60 && d.usage === 0x61 && d.path);
if (!dev) { console.log('键盘未连接'); process.exit(0); }
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

const layerCount = exchange(0x11)[1];
const readLayer = (layer) => {
  const values = [];
  for (let index = 0; index < cells; index += 14) {
    const offset = (layer * cells + index) * 2;
    const size = Math.min(14, cells - index) * 2;
    const bytes = exchange(0x12, [offset >> 8, offset & 255, size], 3);
    for (let i = 4; i < size + 4; i += 2) values.push(bytes.readUInt16BE(i));
  }
  return values;
};

const base = readLayer(0);
const cell = (k) => k.row * 15 + k.col;
const mismatches = layout.filter(k => base[cell(k)] !== k.printedCode);
console.log('层数:', layerCount);
console.log('键位总数:', layout.length);
console.log('与印字不一致的键:', mismatches.length);
for (const k of mismatches.slice(0, 10)) {
  console.log('  ', k.id, k.name, '实际', base[cell(k)].toString(16), '印字', k.printedCode.toString(16));
}

// 顺带看各层是否有非空内容
for (let l = 1; l < layerCount; l++) {
  const vals = readLayer(l);
  const nonTrivial = vals.filter((v, i) => layout.some(k => cell(k) === i) && v !== 0 && v !== 1).length;
  console.log('层', l, '可见键中非空非穿透:', nonTrivial);
}
hid.close();
