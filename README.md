# ESLint

The extension runs ESLint in a dedicated browser worker. Project flat configs are
read by the extension host, transformed from ESM to CommonJS, and sent to the
worker as a bounded in-memory module graph. Relative imports, package `main`,
conditional `exports`, scoped packages, package subpaths, JSON modules, and
CommonJS `require` are supported.

The sandbox worker has no network access. Configs and plugins can only read files
that were preloaded into the virtual module graph, and only a small allowlist of
Node builtins is available. Process creation, sockets, worker threads, and access
to the host filesystem are not exposed. Graphs are limited to 512 modules and
5 MB of source.

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
