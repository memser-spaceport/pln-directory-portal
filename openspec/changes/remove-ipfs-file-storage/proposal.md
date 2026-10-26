# Proposal

## Why

LAB-2992 is wave 2 (High) of the LAB-2977 security spike. The IPFS upload path encrypts files with `crypto-browserify`, a browser polyfill that pulls in packages with known CVEs (`pbkdf2`, `sha.js`, `cipher-base`). The key is just `sha256(FILE_ENCRYPTION_SALT)`, so the salt is in effect the key. `FILE_ENCRYPTION_PASSWORD` is configured but never read, and nothing derives a key with a key-derivation function.

## What Changes

- The API encrypts files with Node's built-in `crypto` instead of `crypto-browserify`.
- New files are encrypted with a key derived by HKDF-SHA256 from `FILE_ENCRYPTION_PASSWORD` (input key material) and `FILE_ENCRYPTION_SALT` (salt). The cipher is fixed to AES-256-CTR, the same cipher the worker uses today. It no longer comes from `FILE_ENCRYPTION_ALGORITHM`.
- New ciphertext starts with a fixed 8-byte version marker, so the reader can tell new files from legacy ones.
- If a secret is missing, encryption fails with an error. It never falls back to the legacy key.
- The Cloudflare file-retrieval worker decrypts both formats. Marked files use the derived key. Unmarked (legacy) files keep the existing `sha256(salt)` path, unchanged.
- Nothing in the API imports `crypto-browserify` anymore. The package stays in `package.json`, because removing it re-resolves unrelated `yarn.lock` entries; dropping it is a separate lockfile cleanup.
- No re-encryption or data migration. A read-only check on 2026-10-26 found 0 IPFS/worker-hosted files in prod and in dev. Every `Image` and `Upload` row is on S3 or an external CDN, and the S3 path never encrypts.

## Capabilities

### New Capabilities
- `file-encryption`: how the API encrypts files before storing them on public storage (IPFS), and how the file-retrieval worker decrypts both current and legacy files.

### Modified Capabilities
<!-- none -->

## Impact

- Code: `apps/web-api/src/utils/file-encryption/file-encryption.service.ts` and its spec; `apps/web-api/cloudflare/workers/web3-file-retrieval/web3-file-retrieval.js`, its spec and its `.md`; `.env.example`.
- Dependencies: none added or removed. `crypto-browserify` stays installed but unimported. The worker keeps its own direct deps (`browserify-aes`, `create-hash`, `buffer`).
- Config: new IPFS uploads need `FILE_ENCRYPTION_PASSWORD`, a random secret, in the API env and as a worker binding. `FILE_ENCRYPTION_ALGORITHM` and `FILE_ENCRYPTION_KEY_LENGTH` are no longer read.
- Runtime: no behavior change for the live S3 upload path, which `FileEncryptionService` never touches. The IPFS path is not in use in any environment today.
- Process: this is a restricted area (secrets/keys), so a human builds it. Vova approves the migration plan in `design.md` on LAB-2992 before merge.
