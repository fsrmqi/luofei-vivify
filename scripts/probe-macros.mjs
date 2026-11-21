import HID from 'node-hid';

const devices = (await HID.devicesAsync()).filter(d =>
  d.vendorId === 0x388d && d.productId === 0x0028 && d.usagePage === 0xff60 && d.usage === 0x61 && d.path);
if (!devices.length) { console.log('未检测到键盘'); process.exit(0); }
const hid = new HID.HID(devices[0].path);

function exchange(command, args = [], echo = args.length) {
  const packet = Buffer.alloc(33);
  packet[1] = command;
  packet.set(args, 2);
  hid.write(packet);
  const reply = hid.readTimeout(800);
  if (!reply || !reply.length) return null;
  const buf = Buffer.from(reply);
  const mismatch = args.slice(0, echo).some((v, i) => buf[i + 1] !== v);
  return { buf, mismatch };
}

const count = exchange(0x0c, [], 0);
console.log('宏数量:', count?.buf[1], 'echo 正常:', !count?.mismatch);

const size = exchange(0x0d, [], 0);
const bufferSize = size ? size.buf.readUInt16BE(1) : 0;
console.log('缓冲区大小:', bufferSize);

// 分块读取，每块 28 字节
const all = [];
let echoOk = true;
for (let off = 0; off < bufferSize; off += 28) {
  const r = exchange(0x0e, [off >> 8, off & 255, 28], 3);
  if (!r) { console.log('offset', off, '无响应'); break; }
  if (r.mismatch) echoOk = false;
  all.push(...r.buf.subarray(4, 4 + 28));
}
console.log('读取字节数:', all.length, '全部 echo 正常:', echoOk);

// 统计非零字节数量，判断是否已有宏
const nonZero = all.filter(b => b !== 0).length;
console.log('非零字节数:', nonZero);
const terminatorPos = all.findIndex(b => b === 0);
console.log('首个 0x00 位置:', terminatorPos);

hid.close();
