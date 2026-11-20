import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const container = process.env.VIVIFY_CONTAINER === '1';
const via = container ? null : await import('./via.ts');
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
  ['/keyboard.js', ['keyboard.js', 'text/javascript']],
  ['/oe927-mac.json', ['oe927-mac.json', 'application/json']]
]);
let busy = false;

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 200_000) throw new Error('配置文件超过大小限制。');
  }
  return JSON.parse(data);
}

async function relay(req: IncomingMessage, res: ServerResponse, route: string) {
  const write = req.method === 'POST';
  const headers: Record<string, string> = { Host: '127.0.0.1:4312' };
  if (write) {
    if (req.headers.origin !== origin) return json(res, 403, { error: '请从本机页面写入键盘。' });
    headers.Origin = 'http://127.0.0.1:4312';
    headers['Content-Type'] = 'application/json';
  }
  const session = req.headers['x-vivify-token'];
  if (typeof session === 'string') headers['x-vivify-token'] = session;

  let body: string | undefined;
  try {
    if (write) body = JSON.stringify(await readBody(req));
  } catch {
    return json(res, 400, { error: '待写入数据无效或超过大小限制。' });
  }
  try {
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const upstream = request(`http://host.docker.internal:4312${route}`, {
        method: req.method, headers, signal: AbortSignal.timeout(15_000)
      }, resolve);
      upstream.on('error', reject);
      upstream.end(body);
    });
    return json(res, response.statusCode ?? 502, await readBody(response));
  } catch {
    return json(res, 503, { error: '无法连接 Mac 键盘服务，请在项目目录运行 pnpm start。' });
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
  if (!session && !status && !read && !write) return json(res, 404, { error: '此地址不存在。' });
  if (!via) return relay(req, res, route);
  if (session) return json(res, 200, { token });
  const { findDevice, isChange, readKeyboard, withDevice, writeChanges } = via;
  if (req.headers['x-vivify-token'] !== token || (write && req.headers.origin !== `http://${authority}`)) {
    return json(res, 403, { error: '会话已失效，请刷新页面。' });
  }
  if (busy) return json(res, 409, { error: '正在与键盘通信，请稍后重试。' });

  busy = true;
  try {
    if (status) return json(res, 200, { detected: Boolean(await findDevice()) });
    if (read) return json(res, 200, { snapshot: await withDevice(readKeyboard) });

    const changes = await readBody(req);
    if (!Array.isArray(changes) || !changes.length || changes.length > 84 * 32 ||
        !changes.every(isChange) ||
        new Set(changes.map(change => `${change.layer}:${change.row},${change.col}`)).size !== changes.length) {
      return json(res, 400, { error: '待写入的键位无效或重复。' });
    }
    const result = await withDevice(via => writeChanges(via, changes));
    return result ? json(res, 200, result) : json(res, 409, { error: '键盘已断开，请插线后重试。' });
  } catch (error) {
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
  host = container ? '0.0.0.0' : '127.0.0.1',
  staticRoot?: string
) {
  if (staticRoot) publicRoot = staticRoot;
  server.requestTimeout = 10_000;
  return new Promise<{ port: number; url: string }>(resolve => {
    server.listen(port, host, () => {
      const address = server.address();
      const actual = typeof address === 'object' && address ? address.port : port;
      // Host 校验始终以浏览器实际使用的回环地址为准，容器模式下监听地址不同。
      authority = `127.0.0.1:${actual}`;
      resolve({ port: actual, url: `http://${authority}` });
    });
  });
}

// 仅 `node server/server.ts` 直接运行时自启；Electron 主进程 import 时由主进程调用 listen()。
if (!process.versions.electron && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  listen().then(({ url }) => console.log(`Flow 2 改键工具  ${url}`));
}
