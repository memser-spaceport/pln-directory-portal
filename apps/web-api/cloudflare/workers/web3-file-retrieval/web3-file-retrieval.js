import 'regenerator-runtime/runtime';
import createHash from 'create-hash/browser';
import { createDecipheriv } from 'browserify-aes/decrypter';
import { Buffer } from 'buffer/'; // Trailing slash to explicitly import the buffer package

function hasValidCid(value) {
  return /[a-zA-Z0-9]{50,}/.test(value);
}

function hasValidFilename(value) {
  return /^[a-z0-9_.@()-]+\.(jpg|jpeg|png|webp|pdf|csv)$/i.test(value);
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
  const fileURL = `https://${cid}.ipfs.dweb.link/${filename}`;

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
    .then((arrayBuffer) => {
      const buffer = Buffer.from(arrayBuffer);
      const iv = buffer.slice(0, 16);
      const chunk = buffer.slice(16);
      const decipher = createDecipheriv('aes-256-ctr', getScryptKey(), iv);
      const result = Buffer.concat([decipher.update(chunk), decipher.final()]);

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
