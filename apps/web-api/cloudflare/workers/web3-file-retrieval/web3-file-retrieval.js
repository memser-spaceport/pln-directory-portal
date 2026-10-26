import 'regenerator-runtime/runtime';
import createHash from 'create-hash/browser';
import { createDecipheriv } from 'browserify-aes/decrypter';
import { Buffer } from 'buffer/'; // Trailing slash to explicitly import the buffer package

function hasValidCid(value) {
  return /[a-zA-Z0-9]{50,}/.test(value);
}

function hasValidFilename(value) {
  return /^[a-z0-9_.@()%-]+\.(jpg|jpeg|png|webp|pdf|csv)$/i.test(value);
}

function getScryptKey() {
  // Environment variable via Cloudflare Dashboard
  // https://developers.cloudflare.com/workers/platform/environment-variables/#environment-variables-via-the-dashboard
  const salt = FILE_ENCRYPTION_SALT;

  // Create hash from salt
  const hash = createHash('sha256');
  hash.update(salt);
  // `hash.digest()` returns a Buffer by default when no encoding is given
  return hash.digest().slice(0, 32);
}

// Files encrypted by the API start with this marker and use a key derived
// with HKDF-SHA256 (see apps/web-api/src/utils/file-encryption). Files
// without it use the legacy layout and key above.
const FILE_ENCRYPTION_MARKER = 'PLNENC02';
const FILE_ENCRYPTION_HKDF_INFO = 'pln-file-encryption-v2';
let derivedKeyPromise;

function hasEncryptionMarker(buffer) {
  return (
    buffer.length >= FILE_ENCRYPTION_MARKER.length + 16 &&
    buffer.slice(0, FILE_ENCRYPTION_MARKER.length).toString('ascii') === FILE_ENCRYPTION_MARKER
  );
}

function getDerivedKey() {
  if (!derivedKeyPromise) {
    derivedKeyPromise = (async () => {
      // Secrets via Cloudflare Dashboard, like FILE_ENCRYPTION_SALT
      if (
        typeof FILE_ENCRYPTION_PASSWORD === 'undefined' ||
        typeof FILE_ENCRYPTION_SALT === 'undefined' ||
        !FILE_ENCRYPTION_PASSWORD ||
        !FILE_ENCRYPTION_SALT
      ) {
        throw new Error('Missing file encryption secrets.');
      }
      const baseKey = await crypto.subtle.importKey(
        'raw',
        Buffer.from(FILE_ENCRYPTION_PASSWORD, 'utf8'),
        'HKDF',
        false,
        ['deriveKey']
      );
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: Buffer.from(FILE_ENCRYPTION_SALT, 'utf8'),
          info: Buffer.from(FILE_ENCRYPTION_HKDF_INFO, 'utf8'),
        },
        baseKey,
        { name: 'AES-CTR', length: 256 },
        false,
        ['decrypt']
      );
    })().catch((error) => {
      derivedKeyPromise = undefined;
      throw error;
    });
  }
  return derivedKeyPromise;
}

async function decryptWithDerivedKey(buffer) {
  const ivStart = FILE_ENCRYPTION_MARKER.length;
  const iv = buffer.slice(ivStart, ivStart + 16);
  const chunk = buffer.slice(ivStart + 16);
  const result = await crypto.subtle.decrypt(
    // length 128 = whole-block counter, as Node's aes-256-ctr increments it
    { name: 'AES-CTR', counter: iv, length: 128 },
    await getDerivedKey(),
    chunk
  );
  return Buffer.from(result);
}

/**
 * Many more examples available at:
 * https://developers.cloudflare.com/workers/examples
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleRequest(request) {
  const { pathname } = new URL(request.url);
  const [, cid, filename] = pathname.split('/');

  // Block either invalid CIDs or filenames:
  if (!hasValidCid(cid) || !hasValidFilename(filename)) {
    return new Response('Invalid request.', { status: 400 });
  }

  // Construct the actual file URL located at a public gateway:
  // https://web3.storage/docs/how-tos/retrieve/#using-an-ipfs-http-gateway
  const fileURL = `https://w3s.link/ipfs/${cid}/${filename}`;

  // Store expected response data according to the file fetching result:
  let headers;
  let finalResponse;

  await fetch(fileURL)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Response failed.');
      }
      headers = response.headers;
      return response.arrayBuffer();
    })
    .then(async (arrayBuffer) => {
      const buffer = Buffer.from(arrayBuffer);
      let result;
      if (hasEncryptionMarker(buffer)) {
        result = await decryptWithDerivedKey(buffer);
      } else {
        const iv = buffer.slice(0, 16);
        const chunk = buffer.slice(16);
        const decipher = createDecipheriv('aes-256-ctr', getScryptKey(), iv);
        result = Buffer.concat([decipher.update(chunk), decipher.final()]);
      }

      finalResponse = new Response(result, {
        status: 200,
        headers,
      });
    })
    .catch(() => {
      finalResponse = new Response('Could not find file.', { status: 502 });
    });

  return finalResponse;
}

addEventListener('fetch', (event) => {
  return event.respondWith(handleRequest(event.request));
});
