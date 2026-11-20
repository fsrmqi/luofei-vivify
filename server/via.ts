import HID from 'node-hid';
import definition from '../public/oe927-mac.json' with { type: 'json' };

const { rows, cols } = definition.matrix;
const cells = rows * cols;
const visible = new Set(definition.layouts.keymap.flat().filter(key => typeof key === 'string'));
const commands = { version: 1, getKey: 4, setKey: 5, layers: 0x11, readBuffer: 0x12 };

export type Change = { layer: number; row: number; col: number; before: number; after: number };
type Result = Change & { status: 'written' | 'conflict' | 'uncertain' | 'pending'; actual?: number };

export async function findDevice() {
  const matches = (await HID.devicesAsync()).filter(device =>
    device.vendorId === Number(definition.vendorId) &&
    device.productId === Number(definition.productId) &&
    device.usagePage === 0xff60 && device.usage === 0x61 && device.path);
  if (matches.length > 1) throw new Error('检测到多把同型号键盘，请只保留要配置的一把。');
  return matches[0];
}

class ViaDevice {
  private hid: InstanceType<typeof HID.HID>;

  constructor(hid: InstanceType<typeof HID.HID>) {
    this.hid = hid;
  }

  exchange(command: number, args: number[] = [], echo = args.length) {
    const packet = Buffer.alloc(33);
    packet[1] = command;
    packet.set(args, 2);
    this.hid.write(packet);
    const reply = this.hid.readTimeout(750);
    if (!reply.length) throw new Error('键盘响应超时，请确认数据线和有线模式。');
    if (reply.length !== 32 || reply[0] !== command ||
        args.slice(0, echo).some((value, i) => reply[i + 1] !== value)) {
      throw new Error('VIA 响应与请求不匹配，请重新读取键盘。');
    }
    return Buffer.from(reply);
  }

  info() {
    const protocol = this.exchange(commands.version).readUInt16BE(1);
    if (protocol !== 12) throw new Error(`此固件返回 VIA 协议版本 ${protocol}，当前支持版本 12。`);
    const count = this.exchange(commands.layers)[1];
    if (count < 1 || count > 32) throw new Error('键盘返回了无效的层数。');
    return { protocol, count };
  }

  readLayer(layer: number) {
    const values = [];
    for (let index = 0; index < cells; index += 14) {
      const offset = (layer * cells + index) * 2;
      const size = Math.min(14, cells - index) * 2;
      const bytes = this.exchange(commands.readBuffer, [offset >> 8, offset & 255, size]);
      for (let i = 4; i < size + 4; i += 2) values.push(bytes.readUInt16BE(i));
    }
    return values;
  }

  readKey({ layer, row, col }: Change) {
    return this.exchange(commands.getKey, [layer, row, col]).readUInt16BE(4);
  }

  writeKey({ layer, row, col, after }: Change) {
    this.exchange(commands.setKey, [layer, row, col, after >> 8, after & 255], 3);
  }
}

export async function withDevice<T>(operation: (via: ViaDevice) => T): Promise<T | null> {
  const device = await findDevice();
  if (!device?.path) return null;
  const handle = new HID.HID(device.path);
  try {
    return operation(new ViaDevice(handle));
  } finally {
    try { handle.close(); } catch { /* 设备可能已断开。 */ }
  }
}

export function readKeyboard(via: ViaDevice) {
  const { protocol, count } = via.info();
  return {
    model: '388d:0028',
    protocol,
    matrix: { rows, cols },
    layers: Array.from({ length: count }, (_, layer) => via.readLayer(layer))
  };
}

export function isChange(value: unknown): value is Change {
  if (!value || typeof value !== 'object') return false;
  const { layer, row, col, before, after } = value as Change;
  return [layer, row, col, before, after].every(Number.isInteger) &&
    layer >= 0 && layer < 32 && visible.has(`${row},${col}`) &&
    before >= 0 && before <= 65535 && after >= 0 && after <= 65535;
}

export function writeChanges(via: ViaDevice, changes: Change[]) {
  const { count } = via.info();
  if (changes.some(change => change.layer >= count)) throw new Error('待写入的层超出当前键盘的层数。');

  const results: Result[] = changes.map(change => ({ ...change, status: 'pending' }));
  for (const result of results) {
    const actual = via.readKey(result);
    if (actual === result.after) {
      result.status = 'written';
      result.actual = actual;
    } else if (actual !== result.before) {
      result.status = 'conflict';
      result.actual = actual;
    }
  }
  if (results.some(result => result.status === 'conflict')) return { results };

  for (const result of results) {
    if (result.status === 'written') continue;
    try {
      const before = via.readKey(result);
      if (before !== result.before) {
        result.actual = before;
        result.status = 'conflict';
        break;
      }
      via.writeKey(result);
      result.actual = via.readKey(result);
      if (result.actual !== result.after) throw new Error('回读键值与待写入值不同。');
      result.status = 'written';
    } catch (error) {
      result.status = 'uncertain';
      return { results, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { results };
}
