import { readFile } from 'node:fs/promises';

export const methods = [
  'inspect', 'describe', 'search', 'suggest', 'searchProducts', 'searchMany', 'getProduct', 'addToBasket', 'addMany',
  'removeFromBasket', 'removeMany', 'getStoreCart', 'getCart', 'getReceipts', 'getOperationLog', 'getReport',
  'getBasketEvidence', 'prepareBasketScreenshot', 'recordArtifact', 'panel.show', 'panel.hide', 'panel.state', 'panel.collapse', 'uninstall',
];

// This function is also embedded verbatim in browser-only agent prompts.
// Keep it self-contained and use only the native browser's documented API.
export function createNativeClient(tab, { timeoutMs = 60000 } = {}) {
  let sequence = 0;
  const prefix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = tab.playwright.locator('#glovo-adapter-response');
  async function result(requestId) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = JSON.parse(await response.textContent({ timeoutMs }));
      if (value.requestId !== requestId || value.state !== 'complete') continue;
      if (!value.ok) throw Object.assign(new Error(value.error), { code: value.code, result: value.result, requestId });
      return value.value;
    }
    throw Object.assign(new Error(`Adapter response is still pending. Read result(${JSON.stringify(requestId)}) to recover it; do not repeat the mutation.`),
      { code: 'RESPONSE_PENDING', requestId });
  }
  return {
    result,
    async call(method, input, requestId = `${prefix}-${++sequence}`) {
      await tab.playwright.getByLabel('Adapter request', { exact: true }).fill(JSON.stringify({ requestId, method, input }), { timeoutMs });
      try {
        await tab.playwright.getByRole('button', { name: 'Run adapter method', exact: true }).click({ timeoutMs });
      } catch (error) {
        // A dispatched click may report an error after the page handler started.
        // Read that request's result instead of risking another mutation.
        const current = JSON.parse(await response.textContent({ timeoutMs }));
        if (current.requestId !== requestId) throw Object.assign(error, { requestId });
      }
      return result(requestId);
    },
  };
}

async function webbridgeRequest(action, args) {
  const response = await fetch('http://127.0.0.1:10086/command', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args, session: 'glovo-webmcp' }), signal: AbortSignal.timeout(65000),
  });
  if (!response.ok) throw new Error(`WebBridge HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error?.message || 'WebBridge command failed.');
  return result.data;
}
export function createClient(request = webbridgeRequest) {
  const transport = [];
  async function send(action, args) {
    const startedAt = new Date().toISOString(), start = performance.now();
    try {
      const value = await request(action, args);
      transport.push({ action: action === 'cdp' ? args.method : action, startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - start, status: 'complete' });
      return value;
    } catch (error) {
      transport.push({ action: action === 'cdp' ? args.method : action, startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - start, status: 'error', error: error.message });
      throw error;
    }
  }
  async function runtime(expression) {
    await send('cdp', { method: 'Emulation.setFocusEmulationEnabled', params: { enabled: true } });
    try {
      const result = await send('cdp', { method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, timeout: 60000 } });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      if (result.result?.type === 'string') {
        try { return JSON.parse(result.result.value); } catch { return result.result.value; }
      }
      return result.result?.value;
    } finally { await send('cdp', { method: 'Emulation.setFocusEmulationEnabled', params: { enabled: false } }); }
  }
  const client = {
    transport, sessionId: null, send, runtime,
    async inject(options = {}) {
      const source = await readFile(new URL('../../glovo.js', import.meta.url), 'utf8');
      const result = await runtime(`(() => {
        const prior = Object.getOwnPropertyDescriptor(window, '__glovoBridgeOptions');
        try { window.__glovoBridgeOptions = ${JSON.stringify(options)}; return (${source.trim()}); }
        finally { if (prior) Object.defineProperty(window, '__glovoBridgeOptions', prior); else delete window.__glovoBridgeOptions; }
      })()`);
      client.sessionId = result.sessionId; return result;
    },
    async call(method, input) {
      if (!methods.includes(method)) throw new Error(`Unknown adapter method: ${method}`);
      const path = method.split('.');
      const envelope = await runtime(`(async () => {
        const bridge = window.glovoBridge;
        if (!bridge) throw new Error('Inject the adapter first.');
        const owner = ${path.length === 2 ? `bridge[${JSON.stringify(path[0])}]` : 'bridge'};
        try {
          const value = await owner[${JSON.stringify(path.at(-1))}](...${JSON.stringify(input === undefined ? [] : [input])});
          return JSON.stringify({ok:true,value,sessionId:bridge.sessionId});
        } catch(error) { return JSON.stringify({ok:false,error:error.message,code:error.code,result:error.result,sessionId:bridge.sessionId}); }
      })()`);
      client.sessionId = envelope.sessionId;
      if (!envelope.ok) throw Object.assign(new Error(envelope.error), { code: envelope.code, result: envelope.result });
      return envelope.value;
    },
    async evidence(path, { restorePanel = true } = {}) {
      // Read state first so restoration also covers preparation failures.
      const panelBefore = await client.call('panel.state');
      try {
        const prepared = await client.call('prepareBasketScreenshot');
        const screenshot = await send('screenshot', { path });
        await client.call('recordArtifact', { kind: 'basket-screenshot', path: screenshot.path, capturedAt: prepared.capturedAt });
        return { ...prepared, screenshot };
      } finally {
        if (restorePanel && panelBefore.visible) await client.call('panel.show', { dock: panelBefore.dock, collapsed: panelBefore.collapsed });
      }
    },
  };
  return client;
}
