import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createClient, createNativeClient } from '../tools/bridge-client.mjs';

test('Native client reads a stable response through a slow mutation and ignores stale results', async () => {
  let request, reads = 0, clicks = 0;
  const selectors = [];
  const tab = { playwright: {
    locator(selector) { selectors.push(selector); return { async textContent() {
      reads++;
      if (reads === 1) return JSON.stringify({ requestId: 'old', state: 'complete', ok: true, value: 'stale' });
      if (reads === 2) return JSON.stringify({ requestId: request.requestId, state: 'pending' });
      return JSON.stringify({ requestId: request.requestId, state: 'complete', ok: true, value: { itemCount: 4 } });
    } }; },
    getByLabel() { return { async fill(value) { request = JSON.parse(value); } }; },
    getByRole() { return { async click() { clicks++; } }; },
  } };
  const client = createNativeClient(tab);
  assert.deepEqual(await client.call('addMany', { items: [] }), { itemCount: 4 });
  assert.deepEqual(selectors, ['#glovo-adapter-response']);
  assert.equal(reads, 3); assert.equal(clicks, 1);
});

test('Native client recovers an existing response and preserves adapter error details without resubmission', async () => {
  let clicks = 0;
  const tab = { playwright: {
    locator() { return { async textContent() { return JSON.stringify({ requestId: 'late-1', state: 'complete', ok: false,
      error: 'outcome unknown', code: 'UNKNOWN_OUTCOME', result: { status: 'unknown' } }); } }; },
    getByRole() { return { async click() { clicks++; } }; },
  } };
  await assert.rejects(createNativeClient(tab).result('late-1'), error => error.requestId === 'late-1' && error.code === 'UNKNOWN_OUTCOME' && error.result.status === 'unknown');
  assert.equal(clicks, 0);
});

test('A click transport error after dispatch recovers the response without clicking again', async () => {
  let request, clicks = 0;
  const tab = { playwright: {
    locator() { return { async textContent() { return JSON.stringify({ requestId: request.requestId,
      state: 'complete', ok: true, value: { itemCount: 0 } }); } }; },
    getByLabel() { return { async fill(value) { request = JSON.parse(value); } }; },
    getByRole() { return { async click() { clicks++; throw new Error('dispatch response lost'); } }; },
  } };
  assert.deepEqual(await createNativeClient(tab).call('removeMany', { receiptIds: [] }), { itemCount: 0 });
  assert.equal(clicks, 1);
});

function fixture(bridge = {}) {
  const requests = [], window = { glovoBridge: { sessionId: 'session-test', ...bridge } };
  const context = vm.createContext({ window });
  const request = async (action, args) => {
    requests.push({ action, args });
    if (action === 'screenshot') return { path: args.path };
    if (args.method !== 'Runtime.evaluate') return {};
    try {
      const value = await vm.runInContext(args.params.expression, context);
      return { result: { type: typeof value, value } };
    } catch (error) { return { exceptionDetails: { text: error.message } }; }
  };
  return { client: createClient(request), requests, window, request, context };
}

test('Method allowlist rejects arbitrary property traversal without evaluating code', async () => {
  const { client, requests } = fixture();
  await assert.rejects(client.call('constructor.constructor', 'anything'), /Unknown adapter method/);
  assert.equal(requests.length, 0);
});

test('Dotted panel calls preserve their owner and JSON inputs cannot escape the expression', async () => {
  const input = { value: '\"`); window.compromised=true; //\n$()' };
  const { client, window } = fixture({ panel: { marker: 3, show(value) { return { marker: this.marker, ...value }; } } });
  assert.deepEqual(await client.call('panel.show', input), { marker: 3, ...input });
  assert.equal(window.compromised, undefined); assert.equal(client.sessionId, 'session-test');
});

test('Native error codes and unknown batch outcomes reach the caller intact', async () => {
  const { client } = fixture({ addMany() { throw Object.assign(new Error('unknown'), { code: 'UNKNOWN_OUTCOME', result: { status: 'unknown' } }); } });
  await assert.rejects(client.call('addMany', []), error => error.code === 'UNKNOWN_OUTCOME' && error.result.status === 'unknown');
});

test('Runtime exceptions always turn transient focus emulation back off', async () => {
  for (const transportFailure of [true, false]) {
    const f = fixture();
    const client = createClient(async (action, args) => {
      if (transportFailure && args.method === 'Runtime.evaluate') { f.requests.push({ action, args }); throw new Error('transport failed'); }
      return f.request(action, args);
    });
    await assert.rejects(client.runtime('throw new Error("page failed")'), /failed/);
    assert.deepEqual(f.requests.filter(item => item.args.method === 'Emulation.setFocusEmulationEnabled').map(item => item.args.params.enabled), [true, false]);
  }
});

function evidenceFixture({ hidden = false, prepareFails = false } = {}) {
  const state = { visible: !hidden, dock: 'right', collapsed: true }, artifacts = [], shows = [];
  const f = fixture({
    panel: { state: () => ({ ...state }), show(input) { shows.push(input); state.visible = true; return state; } },
    prepareBasketScreenshot() {
      state.visible = false;
      if (prepareFails) throw new Error('prepare failed');
      return { capturedAt: '2026-10-05T10:00:00Z', nativeMatchesStructured: true, basket: { itemCount: 1 } };
    },
    recordArtifact(input) { artifacts.push(input); return { recorded: true }; },
  });
  return { ...f, state, artifacts, shows };
}

test('Evidence captures the prepared basket and records its screenshot before restoring the panel', async () => {
  const f = evidenceFixture(); const result = await f.client.evidence('/tmp/basket.png');
  assert.equal(result.nativeMatchesStructured, true); assert.equal(result.screenshot.path, '/tmp/basket.png');
  assert.equal(f.artifacts[0].path, '/tmp/basket.png');
  assert.deepEqual(JSON.parse(JSON.stringify(f.shows)), [{ dock: 'right', collapsed: true }]);
  assert.equal(f.state.visible, true);
});

test('Evidence restores the panel after failed preparation or screenshot transport', async () => {
  for (const prepareFails of [true, false]) {
    const f = evidenceFixture({ prepareFails });
    const client = createClient(async (action, args) => {
      if (action === 'screenshot') throw new Error('screenshot failed');
      return f.request(action, args);
    });
    await assert.rejects(client.evidence('/tmp/basket.png'), /failed/);
    assert.equal(f.state.visible, true); assert.equal(f.shows.length, 1); assert.equal(f.artifacts.length, 0);
  }
});

test('Evidence does not mount or show a panel for a headless session', async () => {
  const f = evidenceFixture({ hidden: true }); await f.client.evidence('/tmp/basket.png');
  assert.equal(f.state.visible, false); assert.equal(f.shows.length, 0);
});

test('Injection installs the complete adapter in one evaluation and restores temporary options', async () => {
  const f = fixture();
  delete f.window.glovoBridge;
  f.window.__glovoBridgeOptions = { existing: true };
  Object.assign(f.context, { location: { hostname: 'glovoapp.com', href: 'https://glovoapp.com', pathname: '/' },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null } });
  const result = await f.client.inject({ panel: 'hidden', dock: 'right' });
  assert.equal(result.version, '0.4.2'); assert.equal(result.panel.mounted, false);
  assert.equal(typeof f.window.glovoBridge.panel.show, 'function');
  assert.equal(f.window.__glovoBridgeOptions.existing, true);
  assert.equal(f.requests.filter(item => item.args.method === 'Runtime.evaluate').length, 1);
});
