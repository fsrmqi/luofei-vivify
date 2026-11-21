import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, access } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
let nativeTool: Promise<string | null> | undefined;
let lastHudAttempt = 0;
let audioQueue: Promise<unknown> = Promise.resolve();

async function findNativeTool() {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resources && join(resources, 'volume-hud'),
    fileURLToPath(new URL('../dist-electron/volume-hud', import.meta.url)),
    fileURLToPath(new URL('./volume-hud', import.meta.url))
  ];
  for (const file of candidates) {
    if (file && await access(file).then(() => true, () => false)) return file;
  }
  if (resources) return null;
  try {
    await run('/usr/bin/xcode-select', ['-p'], { timeout: 2000 });
    const directory = await mkdtemp(join(tmpdir(), 'vivify-volume-'));
    process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
    const tool = join(directory, 'volume-hud');
    const source = fileURLToPath(new URL('./volume-hud.swift', import.meta.url));
    await run('/usr/bin/swiftc', [source, '-o', tool], { timeout: 15_000 });
    return tool;
  } catch {
    return null;
  }
}

async function applyVolumeWithHud(volume: number) {
  if (Date.now() - lastHudAttempt < 330) return null;
  lastHudAttempt = Date.now();
  const tool = await (nativeTool ??= findNativeTool());
  if (!tool) return null;

  try {
    await run(tool, ['check'], { timeout: 1000 });
  } catch {
    nativeTool = Promise.resolve(null);
    return null;
  }

  // 让系统音量键走最后一小步，以便系统自己显示音量提示。
  const direction = volume < 2 ? 'down' : 'up';
  const staged = volume + (direction === 'up' ? -2 : 2);
  await readOrSet({ volume: staged });
  try {
    await run(tool, [direction], { timeout: 1000 });
  } catch {
    nativeTool = Promise.resolve(null);
    return null;
  }
  const actual = await readOrSet();
  return actual.volume === volume ? actual : null;
}
type AudioChange = { volume: number } | { muted: boolean };

export function isAudioChange(value: unknown): value is AudioChange {
  if (!value || typeof value !== 'object') return false;
  const { volume, muted } = value as { volume?: number; muted?: boolean };
  return Object.keys(value).length === 1 &&
    ((typeof volume === 'number' && Number.isInteger(volume) && volume >= 0 && volume <= 100) ||
      typeof muted === 'boolean');
}

export function macAudio(change?: AudioChange) {
  const result = audioQueue.then(() => applyAudio(change));
  audioQueue = result.catch(() => undefined);
  return result;
}

async function applyAudio(change?: AudioChange) {
  if (process.platform !== 'darwin') throw new Error('系统音量控制仅在 macOS 上可用。');
  if (!change) void (nativeTool ??= findNativeTool());
  const actual = change && 'volume' in change
    ? await applyVolumeWithHud(change.volume).catch(() => null) ?? await readOrSet(change)
    : await readOrSet(change);
  if (change && ('volume' in change ? Math.abs(actual.volume - change.volume) > 1 : actual.muted !== change.muted)) {
    throw new Error('当前音频输出设备未接受该调整。');
  }
  return actual;
}

async function readOrSet(change?: AudioChange) {
  const args = [];
  if (change) {
    const instruction = 'volume' in change ? `set volume output volume ${change.volume}` :
      `set volume output muted ${change.muted}`;
    args.push('-e', instruction);
  }
  args.push('-e', 'set s to get volume settings',
    '-e', 'return ((output volume of s) as text) & "," & ((output muted of s) as text)');
  const { stdout } = await run('/usr/bin/osascript', args, { timeout: 3000 });
  const result = /^(\d{1,3}),(true|false)$/.exec(stdout.trim());
  if (!result || Number(result[1]) > 100) throw new Error('当前 Mac 输出设备没有可读的系统音量。');
  return { volume: Number(result[1]), muted: result[2] === 'true' };
}
