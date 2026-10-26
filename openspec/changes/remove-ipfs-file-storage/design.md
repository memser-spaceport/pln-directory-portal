# Design

## Context

See proposal.md for the reasons behind this change. The current state of the code:

- `FileEncryptionService.getEncryptedFile` (`apps/web-api/src/utils/file-encryption/file-encryption.service.ts`) is the only encryption code in the API. It imports `crypto-browserify`, keys the cipher with `sha256(FILE_ENCRYPTION_SALT)[0:32]`, reads the cipher name from `FILE_ENCRYPTION_ALGORITHM`, and writes `iv(16) || ciphertext`.
- It runs only when `FILE_STORAGE=ipfs`, from `FileUploadService.storeImageFiles` and `storeOneAndGetSecureUrl`. The S3 branch uploads plaintext and never calls it. `SharedModule`, `ImagesModule`, `UploadsModule`, `CommandModule` and the Forest Admin agent construct the service, so the constructor must stay side-effect free.
- The API never decrypts. The Cloudflare worker `apps/web-api/cloudflare/workers/web3-file-retrieval/web3-file-retrieval.js` decrypts. It is bundled with webpack and pasted into the Cloudflare dashboard by hand, and it hard-codes `aes-256-ctr` with the same `sha256(salt)` key.
- Data (read-only check, 2026-10-26): prod `Image` has 0 worker/IPFS URLs among ~59k rows (S3 buckets, `images.lumacdn.com`, `images.unsplash.com`, 17 empty). Prod `Upload` has 823 rows, all `S3`. Dev is the same. Nothing encrypted is referenced today.

## Goals / Non-Goals

**Goals:**
- No `crypto-browserify` at API runtime. Node's built-in `crypto` only.
- A real derived key for new files.
- Files encrypted before the change still decrypt through the worker, with the legacy code path left byte-for-byte as it is.
- No behavior change on the live S3 path.

**Non-Goals:**
- Re-encrypting or migrating stored files. None are referenced, and IPFS content is immutable (a new ciphertext means a new CID).
- Authenticated encryption (GCM). IPFS addressing already makes stored bytes tamper-evident: a changed file has a different CID. GCM would add a tag format for no practical gain.
- Removing the IPFS / web3.storage upload path, or modernising the worker's legacy dependencies (`browserify-aes`, `create-hash`).
- Key rotation tooling.

## Decisions

### D1. Node `crypto` in the API
Import `createCipheriv`, `randomBytes` and `hkdfSync` from `crypto`. This is what the ticket asks for, and it drops the polyfill and its vulnerable transitive packages from the API's runtime import graph.

### D2. HKDF-SHA256 over scrypt or PBKDF2
`key = HKDF-SHA256(ikm = FILE_ENCRYPTION_PASSWORD, salt = FILE_ENCRYPTION_SALT, info = "pln-file-encryption-v2", L = 32)`.
- `FILE_ENCRYPTION_PASSWORD` is a server-side secret that ops generate as random bytes (≥ 32 bytes, base64/hex). It is not a human password, so a slow password KDF adds nothing, and HKDF is the right tool.
- HKDF is native in Node (`hkdfSync`) and in Workers Web Crypto (`crypto.subtle.deriveBits`). The worker needs no new bundle dependency and spends no measurable CPU. scrypt is not in Web Crypto and would cost CPU per isolate on the worker.
- Alternative considered: a raw 32-byte key in a new env var. Simpler, but the ticket asks for a derived key, and it would leave the existing `FILE_ENCRYPTION_PASSWORD` meaningless.

### D3. Keep AES-256-CTR, hard-coded
The worker already uses `aes-256-ctr`, and Web Crypto `AES-CTR` with `length: 128` matches Node's full-block counter increment. Hard-coding the cipher removes the API/worker mismatch that `FILE_ENCRYPTION_ALGORITHM` allowed.

### D4. 8-byte version marker `PLNENC02`
New layout: `"PLNENC02" || iv(16) || ciphertext`. Legacy layout: `iv(16) || ciphertext`. Without a marker the worker cannot tell which key to use, because CTR decryption never fails. The chance that a legacy file's random IV starts with these 8 bytes is 2⁻⁶⁴, and no legacy files are in use anyway.

### D5. Worker: add a branch, leave the legacy path alone
In `handleRequest`, after fetching: if the buffer starts with the marker, derive the key once per isolate (module-level cached promise) with `crypto.subtle` HKDF and decrypt with `crypto.subtle` AES-CTR. Otherwise run the existing `createDecipheriv('aes-256-ctr', getScryptKey(), iv)` code unchanged. The new binding is `FILE_ENCRYPTION_PASSWORD` (a Cloudflare secret), read the same way as `FILE_ENCRYPTION_SALT`.

### D6. Fail closed, lazily
The API checks for the password and salt inside `getEncryptedFile`, not in the constructor. That way the many modules that construct the service, and the S3 path, keep booting without the new secret, and an IPFS upload without secrets throws instead of writing weak or plain bytes.

### D7. Keep `crypto-browserify` installed, unimported
Its only importer was this service and its spec. `yarn remove crypto-browserify` re-resolves unrelated `yarn.lock` entries (commitlint, typescript, semver, ts-node), so the package stays in `package.json`. With no import, it is off the API's runtime path. Dropping it belongs to a separate lockfile cleanup.

## Risks / Trade-offs

- [Worker not redeployed before IPFS is turned on] → New files would come back as garbage. Mitigation: IPFS is off everywhere today. The worker redeploy and the `FILE_ENCRYPTION_PASSWORD` binding are a release step in tasks.md, required before anyone sets `FILE_STORAGE=ipfs`, and the worker `.md` documents both.
- [Jest's node environment lacks `globalThis.crypto.subtle` for the worker spec] → On Node 22 it is available. If the configured Jest env hides it, assign `require('crypto').webcrypto` to `global.crypto` in the spec's `beforeAll`, the same way the spec already injects `FILE_ENCRYPTION_SALT`.
- [Weak ops-chosen password] → `.env.example` and the worker `.md` say to generate it with `openssl rand -base64 32`.

## Migration Plan

**Existing files (needs Vova's approval on LAB-2992):**
1. No re-encryption. The read-only queries from 2026-10-26 (prod and dev `Image` URL hosts, `Upload.storage`) found 0 encrypted files referenced by the app.
2. Legacy decrypt stays in the worker, unchanged (D5). Any unreferenced legacy object on IPFS still decrypts through the worker if requested.
3. Re-run the same count query on prod just before merge. If it is non-zero, stop and revisit; nothing in this plan changes for those rows, but the reviewer should know.

**Deploy:**
1. Merge the API change. No env change is needed while `FILE_STORAGE` is S3.
2. Only before anyone enables `FILE_STORAGE=ipfs`: set `FILE_ENCRYPTION_PASSWORD` in the API env (SSM) and as a worker secret, bundle the worker (`yarn webpack --config …/web3-file-retrieval.webpack.js`) and redeploy it.

**Rollback:** revert the PR. Files written in the new format exist only if IPFS was enabled in between. The new worker still reads them, so roll the worker back last.
