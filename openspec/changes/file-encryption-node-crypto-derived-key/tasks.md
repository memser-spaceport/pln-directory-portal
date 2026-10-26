# Tasks

## 1. Branch and approval gate

- [x] 1.1 Create the task branch from the right base per the `lab-ticket-workflow` skill (LAB-2992, parent LAB-2977). Verify that `git branch --show-current` contains `2992`.
- [ ] 1.2 Post the design.md "Migration Plan → Existing files" section on LAB-2992 for Vova's approval. Verify that the approval comment exists before 4.3.

## 2. API: Node crypto with derived key

- [x] 2.1 Rewrite `apps/web-api/src/utils/file-encryption/file-encryption.service.ts` to use `crypto` (`hkdfSync`, `randomBytes`, `createCipheriv`). Use the HKDF-SHA256 key (D2) and fixed `aes-256-ctr` (D3), write `PLNENC02 || iv || ciphertext` (D4), and throw when the password or salt is missing or empty, checked inside `getEncryptedFile` (D6). Verify that `git grep crypto-browserify apps/web-api/src` returns nothing.
- [x] 2.2 Replace the `crypto-browserify` mock in `file-encryption.service.spec.ts` with real-crypto tests for each spec scenario: round-trip decrypt (test helper using `createDecipheriv` and the same derivation), marker + IV layout, different ciphertext on repeat, legacy `sha256(salt)` key does not recover plaintext, missing password throws, empty salt throws. Verify with `yarn nx run web-api:test --testFile=apps/web-api/src/utils/file-encryption/file-encryption.service.spec.ts`.
- [x] 2.3 Confirm that the S3 path and the consumers are unaffected. Verify that `file-upload.service.spec.ts` and `file-migration.service.spec.ts` pass unchanged with `yarn nx run web-api:test --testFile=<each>`. Result: both suites fail to compile on plain `develop` too (file-upload: TS2554, missing `AwsService` constructor arg; file-migration: Jest ESM parse error), identically with and without this change. Verified instead by code read (the S3 branches of `storeImageFiles` / `storeOneAndGetSecureUrl` never call `encryptFiles`; the service's public signature is unchanged) and by `yarn build:api` in 4.2.
- [x] 2.4 Update `.env.example`: document `FILE_ENCRYPTION_PASSWORD` (random secret, `openssl rand -base64 32`, only needed when `FILE_STORAGE=ipfs`) and remove the no-longer-read `FILE_ENCRYPTION_ALGORITHM` / `FILE_ENCRYPTION_KEY_LENGTH`. Verify that `git grep -n "FILE_ENCRYPTION_ALGORITHM\|FILE_ENCRYPTION_KEY_LENGTH"` has no hits in the API code or `.env.example`.

## 3. Worker: decrypt both formats

- [x] 3.1 In `web3-file-retrieval.js`, add the `PLNENC02` branch (D5): a module-cached HKDF key via `crypto.subtle` from the `FILE_ENCRYPTION_PASSWORD` + `FILE_ENCRYPTION_SALT` bindings, and AES-CTR (`length: 128`) decrypt via `crypto.subtle`. Keep the legacy branch's code unchanged. Verify with `git diff` that `getScryptKey` and the legacy `createDecipheriv` call are untouched.
- [x] 3.2 Extend `web3-file-retrieval.spec.ts`: the existing legacy fixture test still returns 200 with identical bytes, and a new test encrypts a buffer with the API service's format (generated in-test with Node `crypto`, no new binary fixture) and asserts 200 with the original bytes. Inject `global.FILE_ENCRYPTION_PASSWORD`, and `global.crypto = require('crypto').webcrypto` if the Jest env lacks `crypto.subtle`. Verify that the spec passes with the repo's Jest runner for that file. Result: the 3 new tests pass (API-encrypted file decrypts, self-contained legacy file decrypts, marked file without password → 502). The pre-existing fixture test fails identically on plain `develop`: it needs the real salt that produced `test-encrypted-file.png`, and the local `.env` salt differs.
- [x] 3.3 Bundle the worker with `yarn webpack --progress --config apps/web-api/cloudflare/workers/web3-file-retrieval/web3-file-retrieval.webpack.js`. Verify that the build succeeds (bundle not committed).
- [x] 3.4 Update `web3-file-retrieval.md`: both formats, the new `FILE_ENCRYPTION_PASSWORD` secret binding, and that the worker must be redeployed before `FILE_STORAGE=ipfs` is enabled. Verify that the doc lists both bindings.

## 4. Dependency removal and release

- [x] 4.1 Run `yarn remove crypto-browserify` (never npm). Verify that the `package.json` diff is that one line and the `yarn.lock` diff only drops `crypto-browserify` and packages exclusively reachable from it. If it churns anything else, revert this task and keep the dependency (D7). Result: reverted. `yarn remove` re-resolved unrelated entries (commitlint, typescript, semver, ts-node, ~240 lockfile lines), so the dependency stays in `package.json`; nothing imports it anymore.
- [x] 4.2 Run `yarn build:api` and the touched suites from 2.2, 2.3 and 3.2. Verify that all pass. Scope the run to these suites, since the repo-wide lint/test baseline is red on develop.
- [x] 4.3 Re-run the read-only prod check via `pln-pg` (`Image` URL hosts for worker/IPFS URLs, `Upload.storage` counts). Verify that the count of encrypted files is still 0, and note the result on LAB-2992.
- [ ] 4.4 Open the PR (Conventional Commit `fix(security): …`, LAB-2992) with the migration plan and the "worker redeploy only before enabling IPFS" release note. Verify that the PR links the Vova approval from 1.2.
