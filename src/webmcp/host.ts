/**
 * Which host is showing this page.
 *
 * WebMCP reaches a page through two very different doors, and "there is no
 * WebMCP here" has a completely different remedy behind each:
 *
 * - **Chrome**, where it is an experimental flag the visitor turns on
 *   themselves — `chrome://flags/#enable-webmcp-testing`, or the
 *   `--enable-features=WebMCP` this repo measured in Chrome 152;
 * - **the ChatGPT desktop app's built-in browser**, where it is a shipped
 *   product feature called *site tools*: on by default, but gated on the app
 *   version, on `Settings › Browser › Permissions › Enable site tools`, and on
 *   the model in use — and absent from the mobile app altogether.
 *
 * Telling a judge inside the ChatGPT app to relaunch Chrome with a flag is
 * advice they cannot act on, and it reads as a page that does not know where it
 * is. This module exists so the gate can say the true, actionable thing.
 *
 * It is a **hint, never a gate.** What decides whether the layer goes live is
 * the probe in `adapter.ts`, which asks the browser instead of believing a
 * user-agent string. If this guesses wrong the copy is less specific; nothing
 * else changes.
 */
export type HostKind = 'chatgpt-desktop' | 'chatgpt-mobile' | 'browser';

export function detectHost(ua = globalThis.navigator?.userAgent ?? ''): HostKind {
  if (!/ChatGPT|OpenAI/i.test(ua)) return 'browser';
  return /iPhone|iPad|iPod|Android|Mobile/i.test(ua) ? 'chatgpt-mobile' : 'chatgpt-desktop';
}
