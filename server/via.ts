import HID from 'node-hid';
import definition from '../public/oe927-mac.json' with { type: 'json' };
import defaultKeymap from '../data/oe927-default-keymap.json' with { type: 'json' };

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

  macroCount() {
    return this.exchange(macro.count)[1];
  }

  macroBufferSize() {
    return this.exchange(macro.bufferSize).readUInt16BE(1);
  }

  readMacroBuffer() {
    const size = this.macroBufferSize();
    const bytes: number[] = [];
    for (let offset = 0; offset < size; offset += macroChunk) {
      const chunk = this.exchange(macro.getBuffer, [offset >> 8, offset & 255, macroChunk], 3);
      bytes.push(...chunk.subarray(4, 4 + Math.min(macroChunk, size - offset)));
    }
    return { count: this.macroCount(), size, bytes };
  }

  writeMacroBuffer(bytes: number[]) {
    const last = this.macroBufferSize() - 1;
    this.exchange(macro.reset, [], 0);
    // 先把缓冲区最后一字节置 0xff 标记写入中，写完再置 0，与 VIA 的做法一致。
    this.exchange(macro.setBuffer, [last >> 8, last & 255, 1, 0xff], 3);
    for (let offset = 0; offset < bytes.length; offset += macroChunk) {
      const slice = bytes.slice(offset, offset + macroChunk);
      this.exchange(macro.setBuffer, [offset >> 8, offset & 255, slice.length, ...slice], 3);
    }
    this.exchange(macro.setBuffer, [last >> 8, last & 255, 1, 0x00], 3);
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

// ---- 宏（VIA 协议 0x0c–0x10，v11 及以上的字节编码） ----
// 缓冲区是一段字节流，每个宏以 0x00 结尾：
//   0x01 0x01 <键值>              点按
//   0x01 0x02 <键值>              按下
//   0x01 0x03 <键值>              抬起
//   0x01 0x04 <数字字符...> 0x7c  延时（毫秒）
//   其他字节                       直接作为字符输入
const macro = { count: 0x0c, bufferSize: 0x0d, getBuffer: 0x0e, setBuffer: 0x0f, reset: 0x10 };
const macroChunk = 28;
const MACRO_PREFIX = 1;
const MACRO_TAP = 1;
const MACRO_DOWN = 2;
const MACRO_UP = 3;
const MACRO_DELAY = 4;
const MACRO_DELAY_END = 0x7c;

export type MacroAction =
  | { type: 'tap'; code: number }
  | { type: 'down'; code: number }
  | { type: 'up'; code: number }
  | { type: 'delay'; value: number }
  | { type: 'text'; value: string };

export type MacroSet = { count: number; size: number; macros: MacroAction[][] };

function decodeMacros(bytes: number[], count: number): MacroAction[][] {
  const macros: MacroAction[][] = [];
  let current: MacroAction[] = [];
  let i = 0;
  while (i < bytes.length && macros.length < count) {
    const byte = bytes[i];
    if (byte === 0) {
      macros.push(current);
      current = [];
    } else if (byte === MACRO_PREFIX && i + 1 < bytes.length) {
      const action = bytes[++i];
      const code = bytes[++i] ?? 0;
      if (action === MACRO_DELAY) {
        const digits = [String.fromCharCode(code)];
        while (++i < bytes.length && bytes[i] !== MACRO_DELAY_END) digits.push(String.fromCharCode(bytes[i]));
        current.push({ type: 'delay', value: Number(digits.join('')) || 0 });
      } else if (action === MACRO_TAP) current.push({ type: 'tap', code });
      else if (action === MACRO_DOWN) current.push({ type: 'down', code });
      else if (action === MACRO_UP) current.push({ type: 'up', code });
    } else {
      const chars = [String.fromCharCode(byte)];
      while (i + 1 < bytes.length && bytes[i + 1] !== 0 && bytes[i + 1] !== MACRO_PREFIX) chars.push(String.fromCharCode(bytes[++i]));
      const text = chars.join('');
      const last = current[current.length - 1];
      if (last && last.type === 'text') last.value += text;
      else current.push({ type: 'text', value: text });
    }
    i++;
  }
  while (macros.length < count) macros.push([]);
  return macros.slice(0, count);
}

function encodeMacros(macros: MacroAction[][]): number[] {
  const bytes: number[] = [];
  for (const actions of macros) {
    for (const action of actions) {
      if (action.type === 'tap') bytes.push(MACRO_PREFIX, MACRO_TAP, action.code);
      else if (action.type === 'down') bytes.push(MACRO_PREFIX, MACRO_DOWN, action.code);
      else if (action.type === 'up') bytes.push(MACRO_PREFIX, MACRO_UP, action.code);
      else if (action.type === 'delay') {
        const digits = String(action.value).split('').map(char => char.charCodeAt(0));
        bytes.push(MACRO_PREFIX, MACRO_DELAY, ...digits, MACRO_DELAY_END);
      } else if (action.type === 'text') {
        for (const char of action.value) bytes.push(char.charCodeAt(0) & 0xff);
      }
    }
    bytes.push(0);
  }
  return bytes;
}

export function isMacroAction(value: unknown): value is MacroAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as MacroAction;
  if (action.type === 'tap' || action.type === 'down' || action.type === 'up') {
    return Number.isInteger(action.code) && action.code >= 0 && action.code <= 0xff;
  }
  if (action.type === 'delay') return Number.isInteger(action.value) && action.value >= 0 && action.value <= 9999;
  if (action.type === 'text') return typeof action.value === 'string' && action.value.length > 0 && action.value.length <= 200;
  return false;
}

// 出厂键位基准来自 data/oe927-default-keymap.json，由 scripts/capture-default.mjs 生成。
// 逐键比对后复用 writeChanges，写入与回读校验走同一套逻辑。
export function resetKeymap(via: ViaDevice) {
  const { count } = via.info();
  const target = defaultKeymap.layers;
  const changes: Change[] = [];
  for (let layer = 0; layer < Math.min(count, target.length); layer++) {
    for (const cell of visible) {
      const [row, col] = cell.split(',').map(Number);
      const after = target[layer][row * cols + col];
      const before = via.readKey({ layer, row, col, before: 0, after });
      if (before !== after) changes.push({ layer, row, col, before, after });
    }
  }
  if (!changes.length) return { results: [], unchanged: true };
  return writeChanges(via, changes);
}

export function readMacros(via: ViaDevice): MacroSet {
  const { count, size, bytes } = via.readMacroBuffer();
  return { count, size, macros: decodeMacros(bytes, count) };
}

export function writeMacros(via: ViaDevice, macros: MacroAction[][]) {
  const count = via.macroCount();
  const size = via.macroBufferSize();
  if (macros.length > count) throw new Error(`键盘只支持 ${count} 个宏。`);
  const bytes = encodeMacros(macros.slice(0, count));
  if (bytes.length > size) throw new Error(`宏共 ${bytes.length} 字节，超出 ${size} 字节缓冲区。`);
  via.writeMacroBuffer(bytes);
  // 写完立即读回，前端据回读结果刷新，避免界面与键盘不一致。
  return readMacros(via);
}