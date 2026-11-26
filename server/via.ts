import HID from 'node-hid';
import definition from '../public/oe927-layout.json' with { type: 'json' };
import defaultKeymap from '../data/oe927-default-keymap.json' with { type: 'json' };

const { rows, cols } = definition.matrix;
const cells = rows * cols;
const visible = new Set(definition.keyRows.flat().map(({ row, col }) => `${row},${col}`));
const commands = { version: 1, getKey: 4, setKey: 5, layers: 0x11, readBuffer: 0x12 };

const backlight = {
  get: 0x08, set: 0x07, channel: 1, brightness: 1, effect: 2,
  readLevels: [0, 63, 127, 191, 255],
  writeLevels: [0, 64, 128, 192, 255]
};
export type BacklightChange = { level: number } | { breathing: boolean };

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
      const length = Math.min(macroChunk, size - offset);
      const chunk = this.exchange(macro.getBuffer, [offset >> 8, offset & 255, length]);
      bytes.push(...chunk.subarray(4, 4 + length));
    }
    return { count: this.macroCount(), size, bytes };
  }

  writeMacroBuffer(bytes: number[], previous: number[]) {
    if (bytes.length !== previous.length) {
      throw new Error('宏缓冲区长度与设备不匹配，请重新读取。');
    }
    const last = previous.length - 1;
    if (bytes.every((byte, index) => byte === previous[index])) return;
    // 明确标记写入中，避免固件执行一份只写了一半的宏。
    this.exchange(macro.setBuffer, [last >> 8, last & 255, 1, 0xff], 3);
    for (let offset = 0; offset < last; offset += macroChunk) {
      const slice = bytes.slice(offset, Math.min(offset + macroChunk, last));
      if (slice.every((byte, index) => byte === previous[offset + index])) continue;
      this.exchange(macro.setBuffer, [offset >> 8, offset & 255, slice.length, ...slice], 3);
    }
    this.exchange(macro.setBuffer, [last >> 8, last & 255, 1, 0], 3);
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

export function isBacklightChange(value: unknown): value is BacklightChange {
  if (!value || typeof value !== 'object') return false;
  const { level, breathing } = value as { level?: number; breathing?: boolean };
  return Object.keys(value).length === 1 &&
    ((typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= 4) ||
      typeof breathing === 'boolean');
}

export function readBacklight(via: ViaDevice) {
  via.info();
  const { channel, brightness, effect } = backlight;
  const rawLevel = via.exchange(backlight.get, [channel, brightness, 0xfe], 2)[3];
  const rawEffect = via.exchange(backlight.get, [channel, effect, 0xfe], 2)[3];
  const level = backlight.readLevels.indexOf(rawLevel);
  if (level < 0 || (rawEffect !== 0 && rawEffect !== 1)) {
    throw new Error('键盘返回了未识别的背光状态。');
  }
  return { level, breathing: rawEffect === 1 };
}

export function writeBacklight(via: ViaDevice, change: BacklightChange) {
  const previous = readBacklight(via);
  const { channel, brightness, effect, writeLevels } = backlight;
  if ('level' in change && change.level !== previous.level) {
    via.exchange(backlight.set, [channel, brightness, writeLevels[change.level]], 2);
  } else if ('breathing' in change && change.breathing !== previous.breathing) {
    via.exchange(backlight.set, [channel, effect, Number(change.breathing)], 2);
  }
  const actual = readBacklight(via);
  if ('level' in change ? actual.level !== change.level : actual.breathing !== change.breathing) {
    throw new Error('背光回读与设置不一致，请重新读取。');
  }
  return actual;
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

  let written = 0;
  for (const result of results) {
    if (result.status === 'written') continue;
    try {
      const before = via.readKey(result);
      if (before !== result.before) {
        result.actual = before;
        result.status = 'conflict';
        return {
          results,
          error: written
            ? `已写入 ${written} 处后发现冲突，请重新读取后处理剩余修改。`
            : '键盘配置有变动，请处理冲突后重试。'
        };
      }
      via.writeKey(result);
      result.actual = via.readKey(result);
      if (result.actual !== result.after) throw new Error('回读键值与待写入值不同。');
      result.status = 'written';
      written++;
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
const macro = { count: 0x0c, bufferSize: 0x0d, getBuffer: 0x0e, setBuffer: 0x0f };
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
        // 延时以 0x7c 结束；遇到宏终止符 0x00 则回退一格，交给外层收槽。
        const digits = [String.fromCharCode(code)];
        while (++i < bytes.length && bytes[i] !== MACRO_DELAY_END) {
          if (bytes[i] === 0) {
            i--;
            break;
          }
          digits.push(String.fromCharCode(bytes[i]));
        }
        if (i >= bytes.length || bytes[i] !== MACRO_DELAY_END) {
          throw new Error('宏延时编码不完整，请用完整快照重新写入宏。');
        }
        current.push({ type: 'delay', value: Number(digits.join('')) || 0 });
      } else if (action === MACRO_TAP) current.push({ type: 'tap', code });
      else if (action === MACRO_DOWN) current.push({ type: 'down', code });
      else if (action === MACRO_UP) current.push({ type: 'up', code });
      else throw new Error(`宏含有未识别的动作码 ${action}，请用完整快照重新写入宏。`);
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
        for (const char of action.value) bytes.push(char.charCodeAt(0));
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
    return Number.isInteger(action.code) && action.code >= 2 && action.code <= 0xff;
  }
  if (action.type === 'delay') return Number.isInteger(action.value) && action.value >= 0 && action.value <= 9999;
  if (action.type === 'text') return typeof action.value === 'string' && /^[\x20-\x7e\t\n]{1,200}$/.test(action.value);
  return false;
}

// 出厂键位基准来自 data/oe927-default-keymap.json，由 scripts/capture-default.mjs 生成。
// 逐键比对后复用 writeChanges，写入与回读校验走同一套逻辑。
export function resetKeymap(via: ViaDevice) {
  const { count } = via.info();
  const target = defaultKeymap.layers;
  if (count !== target.length) throw new Error('键盘层数与本项目的出厂键位基准不同，无法重置。');
  const changes: Change[] = [];
  for (let layer = 0; layer < count; layer++) {
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
  via.info();
  const { count, size, bytes } = via.readMacroBuffer();
  if (bytes.at(-1) !== 0) throw new Error('检测到上次宏写入中断，请用完整快照重新写入宏。');
  return { count, size, macros: decodeMacros(bytes, count) };
}

export function writeMacros(via: ViaDevice, macros: MacroAction[][]): MacroSet {
  via.info();
  const { count, size, bytes: previous } = via.readMacroBuffer();
  if (macros.length !== count) throw new Error(`需要提供完整的 ${count} 个宏槽位。`);
  if (!macros.every(actions => actions.every(isMacroAction))) throw new Error('宏键值或文本格式无效。');
  const bytes = encodeMacros(macros);
  // 末字节既是最后一个宏终止符，也是写入完成标志；刚好写满 size 是合法的。
  if (bytes.length > size) throw new Error(`宏超过可用的 ${size} 字节。`);
  const expected = bytes.concat(Array<number>(size - bytes.length).fill(0));
  via.writeMacroBuffer(expected, previous);

  const result = via.readMacroBuffer();
  if (result.count !== count || result.size !== size ||
      result.bytes.some((byte, index) => byte !== expected[index])) {
    throw new Error('宏回读与写入内容不一致，请重新读取。');
  }
  return { count, size, macros: decodeMacros(result.bytes, count) };
}
