Exact adapter transcript comparison

Both current agents issued one searchMany call, one addMany call, and one receipt cleanup call. They used the evidence command for both native screenshots and the CLI report exporter. Neither read panel.js or adapter.js. The original agents issued four separate additions and four removals, inspected panel source to close the overlay, and constructed report JSON manually.

| Run | Tool calls, old → new | Native basket evidence + image inspection, old → new | Final checks/report, old → new |
|---|---:|---:|---:|
| 3 | 38 → 15 | 74.4s → 8.3s | 93.5s → 23.2s |
| 4 | 39 → 18 | 52.7s → 24.8s | 89.7s → 31.2s |

The phase boundaries match the observable workflow steps: addition completes, basket screenshot is inspected, cleanup and empty screenshot are inspected, then final reporting. Setup differs slightly because the new agents validate their initial basket alongside batch search. All phases include inter-call gaps.

Run 4 retained slow execution intervals. Its observed tool wait was 132.2 seconds, versus 11.1 seconds in run 3. This includes its 23-second local documentation read. No waiting has been removed from the headline results.

Full inputs, outputs, UTC timestamps, and call indices are in transcript-run-3.md, transcript-run-4.md, trace-run-3.json, trace-run-4.json, and phase-audit.json. Internal reasoning and image payloads are omitted.
