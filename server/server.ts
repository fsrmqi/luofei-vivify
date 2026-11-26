import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isAudioChange, macAudio } from './audio.ts';

const via = await import('./via.ts');
const token = randomBytes(32).toString('hex');
/** 静态页面根目录；打包后由主进程注入，命令行运行使用仓库内的 public/。 */
let publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const server = createServer(handle);
/** 由 listen() 在拿到实际端口后填写，供 Host / Origin 校验使用。 */
let authority = '';
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/main.js', ['main.js', 'text/javascript']],
  ['/quick-controls.js', ['quick-controls.js', 'text/javascript']],
  ['/keyboard.js', ['keyboard.js', 'text/javascript']],
  ['/oe927-layout.json', ['oe927-layout.json', 'application/json']]
]);
let busy = false;

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

class RequestBodyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const maxBytes = 200_000;
  if (Number(req.headers['content-length']) > maxBytes) {
    req.resume();
    throw new RequestBodyError('请求超过大小限制。', 413);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) {
      req.resume();
      throw new RequestBodyError('请求超过大小限制。', 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestBodyError('请求内容不是有效的 JSON。', 400);
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  if (req.headers.host !== authority) return json(res, 403, { error: '请使用本机启动地址。' });

  const route = (req.url ?? '/').split('?', 1)[0];
  if (route === '/favicon.ico' && req.method === 'GET') {
    res.writeHead(204);
    return res.end();
  }
  const file = files.get(route);
  if (file && req.method === 'GET') {
    const data = await readFile(join(publicRoot, file[0])).catch(() => null);
    if (!data) return json(res, 404, { error: '页面文件缺失。' });
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
    return res.end(data);
  }
  const session = route === '/api/session' && req.method === 'GET';
  const status = route === '/api/status' && req.method === 'GET';
  const read = route === '/api/keyboard' && req.method === 'GET';
  const write = route === '/api/keyboard' && req.method === 'POST';
  const reset = route === '/api/reset' && req.method === 'POST';
  const readMacros = route === '/api/macros' && req.method === 'GET';
  const writeMacros = route === '/api/macros' && req.method === 'POST';
  const readBacklight = route === '/api/backlight' && req.method === 'GET';
  const writeBacklight = route === '/api/backlight' && req.method === 'POST';
  const readAudio = route === '/api/audio' && req.method === 'GET';
  const writeAudio = route === '/api/audio' && req.method === 'POST';
  if (!readBacklight && !writeBacklight && !readAudio && !writeAudio && !session && !status && !read && !write && !reset && !readMacros && !writeMacros) {
    return json(res, 404, { error: '此地址不存在。' });
  }
  if (session) return json(res, 200, { token });
  const { findDevice, isChange, isMacroAction, readKeyboard, withDevice, writeChanges, resetKeymap, readMacros: readMacroSet, writeMacros: writeMacroSet } = via;
  const mutating = write || reset || writeMacros || writeBacklight || writeAudio;
  if (req.headers['x-vivify-token'] !== token || (mutating && req.headers.origin !== `http://${authority}`)) {
    return json(res, 403, { error: '会话已失效，请刷新页面。' });
  }
  if (readAudio || writeAudio) {
    try {
      if (readAudio) return json(res, 200, { audio: await macAudio() });
      const change = await readBody(req);
      if (!isAudioChange(change)) return json(res, 400, { error: '音量设置无效。' });
      return json(res, 200, { audio: await macAudio(change) });
    } catch (error) {
      if (error instanceof RequestBodyError) return json(res, error.status, { error: error.message });
      return json(res, 502, { error: '当前 Mac 输出设备的系统音量暂不可用。' });
    }
  }
  // 状态查询只枚举 HID 设备、不打开句柄，不占用通信锁，避免轮询挡住写入。
  if (status) {
    try {
      return json(res, 200, { detected: Boolean(await findDevice()) });
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : '无法枚举键盘。' });
    }
  }
  if (busy) return json(res, 409, { error: '正在与键盘通信，请稍后重试。' });

  busy = true;
  try {
    if (readBacklight || writeBacklight) {
      let result;
      if (readBacklight) result = await withDevice(via.readBacklight);
      else {
        const change = await readBody(req);
        if (!via.isBacklightChange(change)) return json(res, 400, { error: '背光设置无效。' });
        result = await withDevice(device => via.writeBacklight(device, change));
      }
      return result ? json(res, 200, { backlight: result }) :
        json(res, 409, { error: '请将键盘切到有线模式并用 USB 数据线直连。' });
    }
    if (read) return json(res, 200, { snapshot: await withDevice(readKeyboard) });
    if (readMacros) return json(res, 200, { macros: await withDevice(readMacroSet) });

    if (reset) {
      // 客户端会带 JSON 体，读掉以免与后续 keep-alive 请求错位；内容本身不用。
      try {
        await readBody(req);
      } catch (error) {
        if (error instanceof RequestBodyError && error.status === 413) throw error;
      }
      const result = await withDevice(resetKeymap);
      return result ? json(res, 200, result) : json(res, 409, { error: '键盘已断开，请插线后重试。' });
    }

    if (writeMacros) {
      const macros = await readBody(req);
      if (!Array.isArray(macros) || !macros.every(
        actions => Array.isArray(actions) && actions.length <= 400 && actions.every(isMacroAction))) {
        return json(res, 400, { error: '宏内容格式无效。' });
      }
      const result = await withDevice(via => writeMacroSet(via, macros));
      return result ? json(res, 200, { macros: result }) : json(res, 409, { error: '键盘已断开，请插线后重试。' });
    }

    const changes = await readBody(req);
    if (!Array.isArray(changes) || !changes.length || changes.length > 84 * 32 ||
        !changes.every(isChange) ||
        new Set(changes.map(change => `${change.layer}:${change.row},${change.col}`)).size !== changes.length) {
      return json(res, 400, { error: '待写入的键位无效或重复。' });
    }
    const result = await withDevice(via => writeChanges(via, changes));
    return result ? json(res, 200, result) : json(res, 409, { error: '键盘已断开，请插线后重试。' });
  } catch (error) {
    if (error instanceof RequestBodyError) return json(res, error.status, { error: error.message });
    return json(res, 502, { error: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
}

/**
 * 启动本地服务。
 * @param port - 端口；传 0 由系统分配空闲端口（Electron 客户端使用）。
 * @param host - 监听地址，默认仅回环地址。
 * @param staticRoot - 静态页面目录，打包后由主进程注入。
 * @returns 实际监听地址与服务地址。
 */
export function listen(
  port = Number(process.env.VIVIFY_PORT ?? 4312),
  host = '127.0.0.1',
  staticRoot?: string
) {
  if (staticRoot) publicRoot = staticRoot;
  server.requestTimeout = 10_000;
  return new Promise<{ port: number; url: string }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      const address = server.address();
      const actual = typeof address === 'object' && address ? address.port : port;
      // Host 校验始终以浏览器实际使用的回环地址为准。
      authority = `127.0.0.1:${actual}`;
      resolve({ port: actual, url: `http://${authority}` });
    });
  });
}

// 仅 `node server/server.ts` 直接运行时自启；Electron 主进程 import 时由主进程调用 listen()。
if (!process.versions.electron && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  listen().then(({ url }) => console.log(`Flow 2 改键工具  ${url}`)).catch(error => {
    console.error(`启动失败：${error.message}`);
    process.exitCode = 1;
  });
}
