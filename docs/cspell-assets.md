# CSpell dictionary asset retention

CSpell configuration entry points and package manifests remain preloaded. Bundled
data files and documentation have discovery metadata but no retained content in
the module-resolution graph or evaluation runtime. CSpell's existing asynchronous
config/dictionary reader fetches content through the extension filesystem when its
effective configuration selects it. This preserves CSpell's locale, programming
language, imports, explicit dictionaries and languageSettings decisions.

Synchronous exists/stat/readdir continue to see deferred paths. Synchronous reads
of preloaded metadata and workspace custom dictionaries keep their existing
behavior. Deferred contents use fs.promises; readFileSync remains synchronous.
There is no exception/retry loop. Raw contents are owned by the requesting reader
and are not added to the shared runtime file map. Disabled spelling rules do not
start the CSpell callback or fetch deferred assets.

## Measurements

Baseline: 2861e2e7b170. Node 24.15.0, identical installed dependencies and
`eslint-plugin-cspell-disabled` fixture, identical document with accepted custom
words and JavaScript vocabulary plus the unknown word `wrld`. Fresh processes
and fresh isolated browser/server profiles for each run. Both browser revisions
use the normal extension archive build with the same server and Chromium.

Preloaded CSpell file content: **4,440,383 -> 212,916 bytes (95.21% reduction)**,
334 -> 133 files. The other 201 paths keep discovery metadata. They include
`dict-en-common-misspellings/dict/dict-en.json` (1,958,137 UTF-8 bytes), English
tries, Java/C++/Python/Go dictionaries, README and LICENSE files. Config entry
points such as each `cspell-ext.json` and `package.json` remain available.

For this JavaScript document, actual dictionary reads include English, companies,
software terms, file types, public licenses, TypeScript, Node and npm vocabulary;
C++/Python/etc. content is fetched only when selected by effective settings.
The imported common-misspellings JSON files are still parsed by CSpell's default
configuration; their raw source is no longer also retained in the virtual FS.
The measurement script emits the complete before/after inventories and actual
demand-read paths, rather than estimating savings from historical snapshots.

Medians of three browser runs, after HeapProfiler.collectGarbage in every live
worker (bytes unless otherwise indicated):

| Measurement                            |   Baseline |  Candidate |
| -------------------------------------- | ---------: | ---------: |
| Evaluation worker used heap            | 62,672,352 | 56,236,188 |
| Evaluation worker backing storage      |  3,167,743 |  2,748,236 |
| All other live workers used heap       | 13,423,412 | 13,390,196 |
| All other live workers backing storage |  4,799,448 |  4,800,235 |
| Cold diagnostics (ms)                  |   10053.48 |    8442.36 |
| Warm diagnostics (ms)                  |      19.62 |      24.67 |

Evaluation heap saves **6.14 MiB (10.27%)**, plus
**409.67 KiB** backing storage. Other workers do not
retain an equivalent allocation. The module-resolution worker is disposed after
the request in both revisions, so there is no live retained resolver heap then.
Chromium exposes backing storage (ArrayBuffers and external strings combined),
not separate Node-style external/ArrayBuffer counters. Virtual process.memoryUsage
zero placeholders are not used as measurements. These are heap metrics, not RSS.

The source-mode harness keeps resolver and evaluator graphs alive together. Three
fresh-process runs after five GCs showed median heap used
131,680,232 -> 124,859,280 bytes (6.50 MiB), with real Node external memory
24,124,974 bytes and ArrayBuffers 4,385,803 bytes unchanged. Cold medians were
5436.03 -> 4711.90 ms; warm medians 1.32 -> 1.38 ms. Source mode does not model
worker transport or browser bundles; the browser comparison above covers those.

All cold/warm diagnostic results matched. Imported custom words, C++
languageSettings (`constexpr`), explicit Python (`isinstance`), JavaScript
identifiers, disabled/active/disabled transitions and preferred
`curch -> church` suggestion/fix (range `[3, 8]`) also matched baseline. A fresh
disabled-rule run performed zero deferred reads and still reported no-debugger.

An initial candidate disabled persisted diagnostics accidentally through a graph
cache schema mismatch, increasing warm latency to around 45 ms. The final
candidate updates both cache consumers and includes deferred file hashes in
persisted diagnostic fingerprints; a regression test covers dictionary edits.

## Reproduction and limits

After integrating the runtime-retention and TypeScript import-wrapper fixes from
main revision `e36f8ad7cc89`, three fresh source-mode runs per revision using the
same selective fixture still showed the raw preload reduction above. Median heap
used was 157,065,744 -> 150,452,408 bytes (6.31 MiB saved), with external memory
26,115,114 bytes and ArrayBuffers 6,308,035 bytes unchanged. Cold latency was
6243.91 -> 5252.88 ms and warm latency 1.32 -> 1.11 ms. Cold/warm diagnostics
matched across revisions. This integration comparison uses the selective fixture;
the earlier browser measurements retain their explicitly stated original baseline.

After installing dependencies and preparing fixture node_modules links with the
normal build/prepare-e2e scripts, run in a fresh Node process for each revision:

```sh
npm run --silent benchmark:cspell-assets -- /path/to/source-revision /path/to/shared/fixture > measurement.json
```

Use the selective fixture with `--scenarios` for the compatibility results and
`--disabled` for a fresh disabled-rule run. Set CSPELL_HEAP_SNAPSHOT to a filename
for a complete post-GC Node snapshot. The assigned attempt retains the original
JSON inventories, measurements, browser CDP harness and fresh complete snapshot.

Parsed dictionaries and CSpell's own config/dictionary caches are unchanged.
Workspace custom dictionary preloading is unchanged. The small sample's latency
numbers include local filesystem/cache scheduling and are not a general timing
guarantee. The historical Downloads snapshot was unavailable and its totals are
not used as current evidence. Required PR checks and the memory budget remain
enabled with unchanged limits.
