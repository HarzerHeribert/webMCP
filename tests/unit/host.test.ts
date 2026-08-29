import { describe, expect, it } from 'vitest';
import { detectHost } from '../../src/webmcp/host';

/**
 * `detectHost` only decides which remedy the gate leads with. It is tested
 * because the wrong answer produces advice the reader cannot act on — telling
 * someone inside the ChatGPT app to relaunch Chrome with a flag — which is the
 * exact failure the gate exists to avoid.
 */
describe('detectHost', () => {
  it('reads an ordinary browser as an ordinary browser', () => {
    expect(detectHost('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36')).toBe('browser');
    expect(detectHost('')).toBe('browser');
  });

  it('separates the ChatGPT desktop app from the mobile app, because only one has site tools', () => {
    expect(detectHost('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ChatGPT/1.2026.8 Electron/33')).toBe(
      'chatgpt-desktop',
    );
    expect(detectHost('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ChatGPT/1.2026.8 Mobile/15E148')).toBe(
      'chatgpt-mobile',
    );
  });

  it('never mistakes a browser that merely mentions a model for a ChatGPT host', () => {
    expect(detectHost('Mozilla/5.0 (X11; Linux x86_64) Firefox/141.0')).toBe('browser');
  });
});
