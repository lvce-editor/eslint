# ESLint

The extension coordinates two dedicated browser workers. The module resolution
worker reads project flat configs, performs Node-compatible resolution,
transforms ESM to CommonJS with Babel, and returns bounded in-memory module
graphs. The ESLint evaluation worker evaluates those graphs and runs ESLint.
Relative imports, package `main`,
conditional `exports`, scoped packages, package subpaths, JSON modules, and
CommonJS `require` are supported.

The evaluation worker has no network access. Configs and plugins can only read
files that were preloaded into the virtual module graph, and only a small
allowlist of Node builtins is available. Process creation, sockets, worker
threads, and access to the host filesystem are not exposed. Graphs are limited
to 512 modules and 5 MB of source.

Some Node-specific plugins may still be incompatible when they depend on native
addons, unsupported Node builtins, dynamic module paths, or synchronous reads of
files outside their static dependency graph. Config dependencies are cached for
interactive performance; editing `eslint.config.js` invalidates that cache.
Successful lint results are cached by editor text, suppressions, and validated
config and ESLint graph revisions. Reloading an unchanged file can therefore
restore diagnostics without rebuilding the evaluation engine; changes to any
lint input fall back to normal evaluation.

## Contributing

```sh
git clone git@github.com:lvce-editor/eslint.git &&
cd eslint &&
npm ci &&
npm test
```

## CPU benchmark

The benchmark opens a file in LVCE Editor with this checkout's ESLint extension,
waits for linting to complete, and writes a browser-wide Chromium CPU trace. A
remote repository is cloned and installed before profiling; a local repository
path is used in place.

```sh
npm run benchmark -- \
  --repo https://github.com/lvce-editor/about-view.git \
  --file packages/about-view/src/parts/AboutFocusId/AboutFocusId.ts
```

Results are written to `.tmp/benchmark-results` by default. Load
`cpu-profile.json` in Chrome DevTools' Performance panel or Perfetto to inspect
work performed by the editor, extension worker, and module-resolution worker.
Use `--output <directory>`, `--timeout <milliseconds>`, or `--headed` to adjust
the run. Install Chromium first with `npx playwright install chromium` if it is
not already available.

Pass `--reload` to populate persistent caches first and profile only the
subsequent renderer reload and lint.
