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

## Contributing

```sh
git clone git@github.com:lvce-editor/eslint.git &&
cd eslint &&
npm ci &&
npm test
```
