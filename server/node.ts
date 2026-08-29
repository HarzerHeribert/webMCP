/** Preview/production entry: the same Hono app, served over Node, on one origin
 *  alongside the built client. `wrangler` is not required for anything the demo
 *  does; M8 decides the hosted target. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createApp } from './app.ts';

const DIST = new URL('../dist/', import.meta.url).pathname;
const app = createApp();
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const response = await app.fetch(
      new Request(url.toString().replace('/api/', '/'), {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body ? new Uint8Array(body) : undefined,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  const path = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  try {
    const file = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(await readFile(join(DIST, 'index.html')));
  }
});

function readBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const port = Number(process.env.PORT ?? 4173);
server.listen(port, () => console.log(`Mandate on http://localhost:${port}`));
