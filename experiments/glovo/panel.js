// Compatibility snippet: the panel is included in adapter.js and mounted through its public API.
(() => {
  if (!window.glovoBridge?.panel) throw new Error('Inject adapter.js first.');
  return JSON.stringify(window.glovoBridge.panel.show());
})()
