// Compatibility snippet: the panel is included in glovo.js and mounted through its public API.
(() => {
  if (!window.glovoBridge?.panel) throw new Error('Inject glovo.js first.');
  return JSON.stringify(window.glovoBridge.panel.show());
})()
