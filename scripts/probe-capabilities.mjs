import HID from 'node-hid';

const cmd = { getProtocol: 1, getKeyboardValue: 2, getKeycode: 4, getLayerCount: 0x11, getBuffer: 0x12,
  macroCount: 0x0c, macroBufferSize: 0x0d, macroGetBuffer: 0x0e };

const devices = (await HID.devicesAsync()).filter(d =>
  d.vendorId === 0x388d && d.productId === 0x0028 && d.usagePage === 0xff60 && d.usage === 0x61 && d.path);
if (!devices.length) { console.log('未检测到键盘'); process.exit(0); }
const hid = new HID.HID(devices[0].path);

function exchange(command, args = [], echo = args.length) {
  const packet = Buffer.alloc(33);
  packet[1] = command;
  packet.set(args, 2);
  hid.write(packet);
  const reply = hid.readTimeout(600);
  if (!reply || !reply.length) return null;
  return Buffer.from(reply);
}

function probe(label, command, args = [], echo = args.length) {
  try {
    const r = exchange(command, args, echo);
    if (!r) { console.log(`${label}: 超时/不支持`); return null; }
    return r;
  } catch (e) { console.log(`${label}: 错误 ${e.message}`); return null; }
}

const ver = probe('协议版本', cmd.getProtocol);
if (ver) console.log('协议版本:', ver.readUInt16BE(1));
const layers = probe('层数', cmd.getLayerCount);
if (layers) console.log('层数:', layers[1]);

const mc = probe('宏数量 (0x0c)', cmd.macroCount);
console.log('宏数量原始回复:', mc ? mc.subarray(0, 6).toString('hex') : 'null');
if (mc) console.log('  -> 宏槽位:', mc[1]);

const mb = probe('宏缓冲区大小 (0x0d)', cmd.macroBufferSize);
console.log('宏缓冲区原始回复:', mb ? mb.subarray(0, 6).toString('hex') : 'null');
if (mb) console.log('  -> 字节数:', mb.readUInt16BE(1));

// 键盘值探测：backlight / rgblight 等
const kbv = (id) => {
  const r = probe('键盘值 id=' + id, cmd.getKeyboardValue, [id]);
  return r;
};
for (const [name, id] of [['UPTIME', 1], ['LAYOUT_OPTIONS', 2], ['SWITCH_MATRIX_STATE', 3], ['FIRMWARE_VERSION', 4], ['BACKLIGHT_LEVEL', 9], ['RGBLIGHT', 0x80]]) {
  const r = kbv(id);
  if (r) console.log(`  ${name}(id=${id}): ${r.subarray(1, 5).toString('hex')}`);
}

hid.close();
