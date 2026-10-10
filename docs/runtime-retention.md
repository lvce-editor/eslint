# Evaluation runtime retention investigation

Baseline: `2861e2e7b1700fac2b5750a320a6ca1f295998c0`. Investigation date: 2026-10-10.

## Reproduction and owners

The historical snapshot and report were unavailable at their stated paths. A fresh Chromium dedicated-worker reproduction establishes the same two-runtime pattern using the current resolver and the `typescript-eslint` e2e fixture (ESLint 10.8.0, TypeScript 6.0.3, typescript-eslint 8.63.0).

After ten alternating cache reloads and performance traces, no project is cached, but baseline retains two full runtime states and two compiled TypeScript scripts. The strong root is the evaluation module’s shared `assert` function. `createBuiltins()` assigns `deepStrictEqual` onto this function; that callback’s lexical context retains the most recent trace runtime. A module export in its `evaluatedModules` map reaches an object shape, descriptor array, accessor getter, TypeScript exports, `sys`, and the filesystem shim, retaining an earlier evaluation runtime. Both operations have completed, so neither runtime has an active owner. The old runtime is indirectly retained through the newer one.

The latest callback is replaced on each evaluation. The observed runtime/compiler counts plateau; this is persistent duplicate retention, not evidence of an unbounded growing leak. An additional empty state-shaped object belongs to a V8 allocation-site template and has no file/module stores populated. It must not be counted as a live runtime.

The fix creates a private callable assert shim for each evaluation. Its callbacks retain only their owning evaluation; when the project cache or trace operation releases that owner, the complete runtime cycle can be collected. No runtime stores are cleared while pending work or lazy module access can still use them. Explicit disposal and worker replacement are unnecessary for the reproduced root.

## Matched measurements

Baseline and candidate use identical cloned input graphs and browser-platform esbuild ESM bundles, with the same configuration and files. Chromium snapshots are taken after `HeapProfiler.collectGarbage`; their totals are snapshot allocation accounting, not RSS. The harness deliberately retains input graphs in the same evaluation worker in both versions.

| Chromium checkpoint        | Baseline MiB | Candidate MiB |
| -------------------------- | -----------: | ------------: |
| Active diagnostics         |        89.26 |         89.26 |
| After 1 reload/trace cycle |       143.70 |         43.16 |
| After 5 cumulative cycles  |       144.03 |         33.45 |
| After 10 cumulative cycles |       144.11 |         33.47 |
| After close/cache clear    |       144.11 |         33.47 |

After ten cycles/close, the candidate saves **110.65 MiB (76.8%)** of Chromium snapshot allocations. Two TypeScript evaluator scripts totaling 17.44 MiB disappear. Total evaluator script source falls from 30.70 MiB to zero. At the first candidate cycle, one TypeScript script remains transiently; by cycles 5 and 10 it is gone. Active warm diagnostics retain one required runtime and compiler in both versions. Closed candidate snapshots contain only the empty V8 state template, with no full runtime.

Node 24.15.0 measurements use three explicit GCs separated by event-loop turns. These are `process.memoryUsage()` samples taken before snapshot capture, and are a different metric from Chromium snapshot totals.

| Node checkpoint | Version   | Heap used MiB | External MiB | ArrayBuffers MiB |
| --------------- | --------- | ------------: | -----------: | ---------------: |
| warm            | Baseline  |        120.38 |         1.85 |             0.02 |
| cycle10         | Baseline  |        134.36 |         1.88 |             0.02 |
| closed          | Baseline  |        120.81 |         1.88 |             0.02 |
| reopened        | Baseline  |        120.49 |         1.88 |             0.02 |
| warm            | Candidate |        120.39 |         1.85 |             0.02 |
| cycle10         | Candidate |        134.32 |         1.88 |             0.02 |
| closed          | Candidate |         37.69 |         1.88 |             0.02 |
| reopened        | Candidate |        120.44 |         1.88 |             0.02 |

Cold/warm diagnostics latency in the matched Node run was 1280.1/2.77 ms on baseline and 1332.6/2.84 ms on candidate. These single-run timings do not establish a speed improvement; cold compilation dominates. Active heap usage is unchanged. Node closed heap use falls by about 83.1 MiB. No allocations are moved into another worker.

## Behavior and regression coverage

- A forced-GC subprocess regression retains only a weak reference to a getter export and asserts collection. It fails on baseline and passes with the fix.
- Assert shims and callbacks remain isolated across evaluations; the isolation regression fails on baseline.
- Lifecycle tests cover pending resolution during invalidation, fresh versus stale config severity, edit/fix ranges, project reopen, and tracing during an active async lint with subsequent lazy module access.
- Real fixture baseline/candidate output is identical for diagnostics, error-to-warning config changes, a no-inferrable-types fix, applying the fix, reopening, and independent project configs. Traced diagnostics match regular diagnostics through repeated cycles.
- Existing compatibility/deferred-worker and conflict-retry tests remain enabled. The complete PR OS matrix retains type-check, workspace tests, lint, headless e2e, static-site build, and the Linux memory-budget gate.

## Reproducibility and limits

Evidence and harnesses are saved in the assigned Trello attempt directory:

`/home/simon/.local/state/trello-worker/5k8NLHLh/attempts/b97e4f1a-6c4c-496d-b3d5-120f6271ed62/`

`harness/resolve.ts` generates graphs using the current resolver and a real filesystem adapter. `harness/entry.ts` exports evaluation APIs for matched browser-platform bundles. `harness/measure.mjs` runs Node diagnostics/reload/trace/close/reopen measurements; `harness/browser.mjs` captures controlled-GC Chromium worker snapshots; `harness/analyze.mjs` identifies state objects and shortest strong retaining paths (weak edges excluded); `harness/behavior.mjs` compares actual diagnostic/fix output. The archived copies mirror `.tmp/runtime-investigation/` in the preserved task worktree. Run the original scripts from that worktree so relative imports resolve; bundle paths and output prefixes are positional arguments. The original one-turn GC samples remain saved separately from settled samples.

Snapshots, analyses, graph inputs, baseline/candidate bundles, JSON memory samples and test logs remain in that directory. The Chromium closed-baseline analysis records both runtime retaining paths; the candidate analysis records the empty allocation template only.

This establishes the current defect and its fix, rather than the precise generation of the unavailable historical snapshot. The measurement harness uses matched esbuild bundles, not the extension’s Rollup release bundle; the existing CI production build/e2e/memory gate covers release integration. Input graph allocations intentionally remain in the harness after runtime collection, so the closed heap is not an empty worker. Project close is represented by evaluation cache invalidation; actual extension worker shutdown also terminates the entire heap.
