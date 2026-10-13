# SyncForge Release Engineering & Distribution Guide

This document establishes the versioning policy, release checklist, package verification process, and distribution workflows for `@syncforge/sdk` and related packages.

---

## 1. Semantic Versioning Policy

SyncForge adheres strictly to [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR (X.0.0)**: Incompatible public API changes (e.g. protocol handshake breaking modifications, deprecating existing core SDK signatures without fallback).
- **MINOR (0.X.0)**: Backward-compatible functionality additions (e.g. adding new hooks to `@syncforge/sdk/react`, supporting new CRDT shared data adapters).
- **PATCH (0.0.X)**: Backward-compatible bug fixes and internal performance optimizations (e.g. reconnection jitter tuning, memory leak patches).

---

## 2. Package Architecture & Bundle Verification

The SDK is packaged via `tsup` into dual module formats:

- **ESM (`dist/index.js`, `dist/react/index.js`)**: Modern browsers, Next.js, Vite, and ESM Node runtimes.
- **CJS (`dist/index.cjs`, `dist/react/index.cjs`)**: CommonJS Node environments and legacy toolchains.
- **DTS (`dist/index.d.ts`, `dist/react/index.d.ts`)**: TypeScript declaration files with fully bundled shared types.

### Bundling Isolation Guarantee

`@syncforge/shared` protocol definitions and Zod schemas are compiled directly into the distribution bundle via `--no-external @syncforge/shared`. External consumers install `@syncforge/sdk` without needing access to unpublished monorepo workspace packages.

---

## 3. Pre-Release Verification Checklist

Before publishing any version of `@syncforge/sdk`:

1. **Clean Build**:
   ```powershell
   npm run build --workspace=@syncforge/sdk
   ```
2. **Type Check**:
   ```powershell
   npm run typecheck --workspace=@syncforge/sdk
   ```
3. **Run All Automated Tests**:
   ```powershell
   npm test
   ```
4. **Inspect Tarball Contents (Dry-Run)**:
   ```powershell
   npm run package:inspect --workspace=@syncforge/sdk
   ```
   **Verification Criteria**:
   - Total files must only include `dist/`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `package.json`.
   - Ensure NO `.env` files, `.git/`, internal test fixtures, or local secrets are present in the package manifest.
5. **Verify External Consumer Fixture**:
   ```powershell
   npx tsc --noEmit --project examples/external-consumer/tsconfig.json
   ```
6. **Update Changelog**:
   Record new features, breaking changes, and bug fixes in [`packages/sdk/CHANGELOG.md`](file:///d:/SyncForge/packages/sdk/CHANGELOG.md).

---

## 4. Packaging Inspection Command

To inspect the package contents without publishing to any registry:

```powershell
npm run package:inspect --workspace=@syncforge/sdk
```

This runs `npm pack --dry-run` and outputs the exact file list, unpacked size, and SHA integrity hash.

---

## 5. Security & Secret Exclusion

The SDK's `package.json` specifies an explicit whitelist:

```json
"files": [
  "dist",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
]
```

Any files not in this array are excluded by npm during tarball creation. Local `.env`, test scripts, and build artifacts are barred from entering the published artifact.
