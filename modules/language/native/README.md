# Native Sudachi

The shared TypeScript API remains `getSudachiPronunciationMap(texts)` in `../server/sudachi-pronunciation.ts`. A Node-API addon runs analysis on libuv's native task pool; the dictionary and dictionary-reading memoization remain resident. There are no child processes, pipes, Python packages, or runtime executable dependencies.

## Build

Requires Node.js 22–26, Rust 1.88+ with Cargo, and the platform's native linker (Xcode Command Line Tools on macOS; a C/C++ build toolchain on Linux/Windows).

```sh
npm ci                 # Generates Prisma, verifies/downloads the dictionary, builds the addon
npm run sudachi:setup  # Repeat setup after removing generated assets
npm run sudachi:build  # Rebuild after editing Rust
npm run sudachi:benchmark
```

The initial download needs network access. `scripts/setup-sudachi.mjs` verifies the extracted dictionary's SHA-256 and installs it atomically. An existing file with a different checksum is rejected, never silently overwritten. Rust dependencies are pinned by `Cargo.lock`.

Build on the target OS/architecture. `.npmrc` uses `install-links=true` so the local package is installed as a real dependency; Next cannot externalize its native binary through a workspace symlink. Setup copies built runtime assets into that installed package. Deploy `index.cjs`, `sudachi.node`, and `resources/` together with the local npm package. Next.js externalizes the package and traces these runtime assets; Cargo's build tree is excluded. A deployed server does not need Rust or Python.

## Compatibility

- Engine: upstream `WorksApplications/sudachi.rs`, commit `90fd6068c80c2fc3b63e0dbab0e341475bad4d8f` (0.6.11), identical to the former SudachiPy engine.
- Dictionary: full 20260428; SHA-256 `2c993988aae44cbad92b395790c951aa2dad957c983a7d4c32944f6263e02593`.
- Resources/plugins and split mode C are unchanged. Resource files come from the same upstream release; see `LICENSE` and `resources/LEGAL`.
- Token offsets remain Unicode codepoint offsets, including non-BMP characters. Surface trimming, hiragana conversion, first-occurrence maps, original ordering, and contextual corrections are preserved.
- The TypeScript cache retains its 100-entry bound, duplicate in-flight requests share work, and failures fall back to personal pronunciation without being cached. Native requests retain the 15–60 second analysis budget and 20 MiB output bound.
- Diagnostics report queue, native analysis, and total durations directly. `SUDACHI_PYTHON` and `SUDACHI_WORKER_MODE` are no longer runtime configuration.

The benchmark uses synthetic/public text from `scripts/fixtures/sudachi-parity.json`; private corpus comparisons stay in ignored local outputs.
