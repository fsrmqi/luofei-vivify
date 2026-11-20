import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const container = process.env.VIVIFY_CONTAINER === '1';
const port = container ? 4313 : Number(process.env.VIVIFY_PORT ?? 4312);
const authority = `127.0.0.1:${port}`;
const origin = `http://${authority}`;
const via = container ? null : await import('./via.ts');
const token = randomBytes(32).toString('hex');
const publicRoot = new URL('../public/', import.meta.url);
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

const server = createServer(async (req, res) => {
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
    const data = await readFile(new URL(file[0], publicRoot)).catch(() => null);
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
  if (req.headers['x-vivify-token'] !== token || (write && req.headers.origin !== origin)) {
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
});

server.requestTimeout = 10_000;
server.listen(port, container ? '0.0.0.0' : '127.0.0.1', () => console.log(`Flow 2 改键工具  ${origin}`));
