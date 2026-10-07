import { spawn } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function connectCdp(url) {
  const socket = new WebSocket(url), pending = new Map(), handlers = new Set();
  let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    } else for (const handler of handlers) handler(message);
  });
  socket.addEventListener('close', () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Chrome disconnected; do not replay basket writes.')); }
    pending.clear();
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Could not connect to Chrome.')), { once: true }); });
  return {
    send(method, params = {}, timeout = 30000) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome ${method} timed out; do not replay mutations.`)); }, timeout);
        pending.set(id, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id, method, params })); }
        catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    },
    onEvent(handler) { handlers.add(handler); return () => handlers.delete(handler); },
    close() { socket.close(); },
  };
}

export async function openChrome({ chrome, profile = join(homedir(), '.common-thread-commerce/chrome'), headless = false } = {}) {
  profile = resolve(profile); await mkdir(profile, { recursive: true, mode: 0o700 });
  async function endpoint() {
    const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
    if (!/^\d+$/.test(port) || !path.startsWith('/devtools/browser/')) throw new Error('Invalid Chrome debugging endpoint.');
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(origin + '/json/version', { signal: AbortSignal.timeout(1000) });
    if (!response.ok) throw new Error('Chrome is not ready.');
    const info = await response.json();
    if (info.webSocketDebuggerUrl !== `ws://127.0.0.1:${port}${path}` && info.webSocketDebuggerUrl !== `ws://localhost:${port}${path}`)
      throw new Error('Chrome endpoint did not match this profile.');
    const browser = await connectCdp(info.webSocketDebuggerUrl);
    try {
      const command = await browser.send('Browser.getBrowserCommandLine');
      if (!command.arguments.includes('--user-data-dir=' + profile)) throw new Error('Chrome uses a different profile.');
      return { browser, origin };
    } catch (error) { browser.close(); throw error; }
  }
  let connection;
  try { connection = await endpoint(); } catch {}
  if (!connection) {
    const candidates = chrome ? [chrome] : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : process.platform === 'win32' ? [join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'), join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/snap/bin/chromium'];
    let executable;
    for (const path of candidates) { try { await access(path); executable = path; break; } catch {} }
    if (!executable) throw new Error('Google Chrome was not found. Pass --chrome /path/to/chrome.');
    const env = { ...process.env }; delete env.OPENROUTER_API_KEY;
    const child = spawn(executable, ['--user-data-dir=' + profile, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
      '--enable-automation', '--no-first-run', '--no-default-browser-check', ...(headless ? ['--headless=new'] : []), 'about:blank'],
    { detached: true, stdio: 'ignore', env });
    let launchError; child.on('error', () => { launchError = true; }); child.unref();
    for (let i = 0; i < 80 && !connection; i++) {
      if (launchError) throw new Error('Chrome could not be launched.');
      await pause(250); try { connection = await endpoint(); } catch {}
    }
    if (!connection) throw new Error('Chrome did not expose its debugging endpoint. Close this tool’s Chrome profile and retry.');
  }
  const { browser, origin } = connection;
  try {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const response = await fetch(origin + '/json/list');
    const target = (await response.json()).find(target => target.id === targetId);
    if (!target?.webSocketDebuggerUrl) throw new Error('Chrome did not create the requested tab.');
    const page = await connectCdp(target.webSocketDebuggerUrl);
    return { browser, page, profile, targetId, disconnect() { page.close(); browser.close(); } };
  } catch (error) { browser.close(); throw error; }
}

export async function evaluate(page, fn, input, timeout = 30000) {
  const result = await page.send('Runtime.evaluate', { expression: `(${fn.toString()})(${JSON.stringify(input)})`,
    awaitPromise: true, returnByValue: true }, timeout);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
