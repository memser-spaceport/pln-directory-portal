# Web3 File Retrieval using Cloudflare workers

## Why?

Following the [decision](https://3.basecamp.com/3322517/buckets/25238305/todos/5059003699) to use [Web3Storage](https://web3.storage/) as the file storage service we were faced with the need to store files encrypted as they are publicly accessible by anyone due to web3's nature (public IPFS gateways) and Web3Storage not automatically providing encryption-at-rest.

Having those files encrypted meant that we needed a simple and performant way to serve those files decrypted to our web app and for that reason we've decided to use a serveless function that runs on [Cloudflare workers](https://workers.cloudflare.com/) which gave us exactly what we needed as documented [here](https://pixelmatters.atlassian.net/wiki/spaces/PL/pages/2802483213/Web3+File+Storage).

## How?

With the above in mind, we've created a worker script that is responsible for:

1. Receiving an incoming request to a file with the following structure:<br>
   (e.g. `https://our-worker-domain.com/{web3_file_cid}/{file_name}`)
2. Parse the incoming URI path to extract the [web3 file CID](https://web3.storage/docs/concepts/content-addressing/#cids-location-independent-globally-unique-keys) and its filename.
3. Fetch the actual file from Web3Storage through a [public IPFS gateway](https://web3.storage/docs/how-tos/retrieve/#using-an-ipfs-http-gateway):<br>
   (e.g. `https://{web3_file_cid}.ipfs.dweb.link/{file_name}`)
4. Finally, decrypt and return the file as the worker response to the incoming request.
   <br><br>

---

<br>

### Bundling the worker script

Since the worker script has external dependencies we can't just copy & past the whole script into Cloudflare but instead we need to use a bundler (in this case webpack) to address this requirement.

In order to bundle the worker script, we need to run the following command:

```bash
yarn webpack --progress --config apps/web-api/cloudflare/workers/web3-file-retrieval/web3-file-retrieval.webpack.js

# Output goes into the global dist folder.
```

### Encryption formats

The worker decrypts two layouts, both AES-256-CTR:

| Layout | Bytes | Key |
|---|---|---|
| Current (written by the API) | `PLNENC02` (8) · IV (16) · ciphertext | HKDF-SHA256 of `FILE_ENCRYPTION_PASSWORD`, salt `FILE_ENCRYPTION_SALT`, info `pln-file-encryption-v2` |
| Legacy (no marker) | IV (16) · ciphertext | `sha256(FILE_ENCRYPTION_SALT)` |

### Secrets

Set both as encrypted variables on the worker in the Cloudflare Dashboard, with the same values as the API env:

- `FILE_ENCRYPTION_PASSWORD`: random secret (`openssl rand -base64 32`)
- `FILE_ENCRYPTION_SALT`

Redeploy the bundled worker with both secrets before setting `FILE_STORAGE=ipfs` on the API. Otherwise files the API encrypts come back from the worker as `502`.
