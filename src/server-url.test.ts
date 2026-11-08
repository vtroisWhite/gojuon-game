import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, createServer, preview } from 'vite';
import type { PreviewServer, ViteDevServer } from 'vite';
import config from '../vite.config';

let dev: ViteDevServer | undefined;
let production: PreviewServer | undefined;
let devUrl: string;
let previewUrl: string;

beforeAll(async () => {
  dev = await createServer({
    ...config,
    configFile: false,
    logLevel: 'silent',
    cacheDir: '.cache/url-test-deps',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null },
  });
  await dev.listen();
  const devAddress = dev.httpServer!.address();
  if (!devAddress || typeof devAddress === 'string') throw new Error('Missing dev address');
  devUrl = `http://127.0.0.1:${devAddress.port}`;
  await build({
    ...config,
    configFile: false,
    logLevel: 'silent',
    build: { outDir: '.cache/url-test-dist', emptyOutDir: false },
  });
  production = await preview({
    ...config,
    configFile: false,
    logLevel: 'silent',
    build: { outDir: '.cache/url-test-dist' },
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  const previewAddress = production.httpServer.address();
  if (!previewAddress || typeof previewAddress === 'string')
    throw new Error('Missing preview address');
  previewUrl = `http://127.0.0.1:${previewAddress.port}`;
}, 30000);

afterAll(async () => {
  if (dev) await dev.close();
  if (production)
    await new Promise<void>((resolve, reject) => {
      if ('closeAllConnections' in production!.httpServer) {
        production!.httpServer.closeAllConnections();
      }
      production!.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
});

describe.each(['dev', 'preview'])('%s public entry', (mode) => {
  it.each(['/gojuon-game', '/gojuon-game/', '/gojuon-game?lang=en', '/gojuon-game/?lang=en'])(
    'serves %s directly with valid asset paths',
    async (path) => {
      const origin = mode === 'dev' ? devUrl : previewUrl;
      const response = await fetch(origin + path, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      const html = await response.text();
      expect(html).toContain('id="root"');
      expect(html).not.toContain('did you mean to visit');
      const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
      expect(resources, JSON.stringify(resources)).toContain(
        '/gojuon-game/fonts/klee-one-kana-regular.woff2',
      );
      expect(resources).toContain('/gojuon-game/favicon.svg');
      for (const resource of resources) {
        expect(resource.startsWith('/gojuon-game/')).toBe(true);
        expect((await fetch(origin + resource)).status).toBe(200);
      }
    },
    15000,
  );
});
