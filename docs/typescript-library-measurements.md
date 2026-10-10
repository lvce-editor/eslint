# TypeScript declaration library measurements

Baseline: `2861e2e7b170`. TypeScript 6.0.3, typescript-eslint 8.63.0, fixture ESLint 10.8.0, Node 24.15.0, headless Chromium through the existing benchmark runner. Measured 2026-10-10 on Linux.

The resolver now preserves `typesMap.json` but does not put declaration libraries in config/module graphs. Modern ESLint calculates the effective configuration for the document before linting. When parser options request a Program, a disposable host uses the loaded project's TypeScript compiler to discover configuration inheritance, project inputs, library overrides and transitive references. Async reads finish before the real parser runs. Configuration modules that construct their own Programs are evaluated with bounded filesystem hydration and replay before their exports reach ESLint; concurrent graph evaluations share a serial queue. Only the final probe's inputs are committed to the evaluator filesystem; the resolver does not cache their contents. Ordinary edits reuse preparation when their imports and declaration references are unchanged. Config/dependency file changes invalidate the project runtime, including paths discovered outside the config folder and newly installed overrides.

## Method

The same installed dependencies, fixture files, configurations and `npm run build` mode were used for both revisions. Each sample starts a fresh browser context, opens one document, awaits explicit diagnostics, then repeats the exact document. Cold duration includes opening the document and completing diagnostics. Warm duration includes the normal result cache; it is not a measurement of uncached edits. One sample per workload is insufficient to establish a latency trend, especially on a machine with concurrent tasks.

`HeapProfiler.collectGarbage` precedes `Runtime.getHeapUsage` and the evaluator snapshot. All 17 other live worker targets were collected and measured separately. The module-resolution worker was already disposed in every capture. An earlier clear-cache-after-open experiment overlapped automatic linting and sometimes retained two runtimes; those samples are excluded from the table.

Declaration counts/payloads come from `files` records in the snapshots. Payload bytes are the installed UTF-8 file lengths for those observed paths; snapshot string values are truncated. String shallow size counts unique source nodes, avoiding duplicate references. Heap used is Chromium's actual live-heap metric, not the sum of file lengths or process RSS. CDP exposes backing storage and embedder heap, but does not separately expose Node-style external and ArrayBuffer totals for these workers. Embedder heap used was 22,280 bytes in every evaluator sample.

## Results

MiB = 1,048,576 bytes. Backing storage is reported in bytes.

| Workload | Revision  | Declarations | Payload MiB | Declaration strings MiB | Heap used MiB | Cold seconds | Warm milliseconds | Backing storage |
| -------- | --------- | -----------: | ----------: | ----------------------: | ------------: | -----------: | ----------------: | --------------: |
| syntax   | baseline  |          108 |       3.609 |                   6.670 |        59.851 |       16.566 |             50.35 |          367078 |
| syntax   | candidate |            0 |       0.000 |                   0.000 |        53.250 |       12.065 |             19.38 |          384133 |
| es       | baseline  |          108 |       3.609 |                   6.670 |        66.599 |       13.031 |             21.50 |          367087 |
| es       | candidate |           45 |       0.415 |                   0.484 |        61.175 |       12.742 |             18.37 |          384142 |
| dom      | baseline  |          108 |       3.609 |                   6.670 |        88.678 |       12.293 |             22.85 |          367088 |
| dom      | candidate |           46 |       2.655 |                   4.965 |        87.553 |       14.666 |             22.16 |          384143 |

Syntax-only retained no declaration libraries and used about 6.60 MiB less evaluator heap. ES-only (`lib: ["es2020"]`) retained 45 declaration files and used about 5.42 MiB less heap. DOM (`lib: ["es2020", "dom"]`) retained 46 and used about 1.12 MiB less heap. The DOM library remains present. These measured savings are smaller than the original 13.38 MiB upper bound from two preloaded stores. File payload, string allocation and whole-heap savings are different quantities.

Other-worker heap totals were 15.826/15.846/15.843 MB for baseline syntax/ES/DOM and 15.776/15.795/15.774 MB for the candidate, with no resolution worker remaining. There is no corresponding multi-megabyte shift into another live worker. Evaluator backing storage grew by about 16.7 KiB. The DOM cold sample took longer with the candidate; the disposable probe adds initial work. The syntax and ES samples were faster, but a single sample cannot establish a performance improvement. No rules were disabled and no memory-budget threshold was raised.

The table isolates this feature at commit `769b00eeb3cfc09fb69292193fc8045aeb204364`, including the preparation cache, Windows path normalization and early Program hydration. The integration branch also includes newer main changes for assert runtime retention (#154) and TypeScript import wrappers (#156); their savings are not attributed to this table. Full PR CI, including the existing memory gate, validates the combined source.

## Functional coverage

The original syntax-only fixture still reports `no-explicit-any`. The real editor e2e regression checks cold/warm typed diagnostics and applies a rule-provided fix for default libraries, explicit ES libraries, DOM, WebWorker, `noLib`, inherited configurations, and a custom DOM replacement whose literal type differs from the built-in DOM library. The six default/ES/DOM/WebWorker/noLib/inherited scenarios pass on baseline and candidate. The additional custom-replacement UI scenario validates the final candidate alongside the real-compiler custom-library tests.

Real-compiler tests cover transitive reference-lib dependencies, document references, target defaults, local/package inheritance, project globs, project service configuration selection, supplied Programs, and custom `@typescript/lib-*` replacements when enabled by the compiler version/options. Runtime tests cover URI filesystems, native Windows paths, included source-file references, a real typed Program using custom libraries, preparation reuse on ordinary edits, and loading newly added library references. Invalidation tests cover inherited configs and creation of a previously missing custom-library path after resolver disposal.

Legacy Linter configurations conservatively prepare the union of configured parser options; modern ESLint uses its effective per-file configuration. Selected files remain shared by the project runtime's cached Programs until that runtime is invalidated. The temporary probe's AST is collectible and is not stored as another parser Program.

Raw heaps, CPU traces, CDP worker metrics, source copies, scripts and JSON summaries are saved in the assigned attempt directory:
`~/.local/state/trello-worker/5k8NLHLh/attempts/caad4261-1b90-4ff4-95b5-b443b456ab7b/`.
The accepted samples are in `measurements-stable/` and `measurements-stable-summary.json`; `measure-stable.py`, `measure-final-candidate.py` and `summarize-measurements.mjs` document capture/extraction. Preliminary samples and their source copies are preserved separately.
