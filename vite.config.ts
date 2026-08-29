import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect, PluginOption } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './server/app';

/**
 * The service runs *inside* the dev server, so client and API share one origin
 * in development exactly as they will in production. WebMCP tools registered by
 * the page call the same URLs a human click does; a proxy to a second port would
 * have made that a lie only production could expose.
 */
function apiPlugin(): PluginOption {
  const app = createApp();
  return {
    name: 'mandate-api',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url.replace('/api', ''), 'http://localhost');
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const response = await app.fetch(
          new Request(url, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body: chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined,
          }),
        );
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      };
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: { port: 5173 },
});
