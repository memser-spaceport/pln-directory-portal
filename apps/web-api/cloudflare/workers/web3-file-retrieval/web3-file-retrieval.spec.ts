import fs from 'fs';
import { randomBytes } from 'crypto';

// Spec constants:
const TEST_WORKER_BASE_URL = 'https://dummy-domain-worker.dev';
const TEST_VALID_CID = randomBytes(59).toString('hex');
const TEST_DECRYPTED_FILE_HEADERS = {
  'content-type': 'image/png',
};

describe('Cloudflare Worker: Web3 File Retrieval', () => {
  // Module mock:
  let handleRequest;

  beforeAll(() => {
    global.addEventListener = jest.fn();
    global.FILE_ENCRYPTION_SALT = process.env.FILE_ENCRYPTION_SALT;
    // Global-as-any to avoid unnecessary TS inference of the Response interface:
    (global as any).Response = jest.fn(function (body, options) {
      this.body = body;
      this.status = body?.status || options.status;
      this.headers = body?.headers || options?.headers;
    });

    // After mocking global variables, let's import our testing module:
    ({ handleRequest } = jest.requireActual('./web3-file-retrieval'));
  });

  describe('when requesting a file', () => {
    describe('with a missing content id', () => {
      it('should return a bad request response', async () => {
        const response = await handleRequest({
          url: `${TEST_WORKER_BASE_URL}/file.jpg`,
        });
        expect(response.status).toBe(400);
      });
    });

    describe('with an invalid content id', () => {
      it('should return a bad request response', async () => {
        const response = await handleRequest({
          url: `${TEST_WORKER_BASE_URL}/invalid-cid/file.jpg`,
        });
        expect(response.status).toBe(400);
      });
    });

    describe('with a missing filename', () => {
      it('should return a bad request response', async () => {
        const response = await handleRequest({
          url: `${TEST_WORKER_BASE_URL}/${TEST_VALID_CID}`,
        });
        expect(response.status).toBe(400);
      });
    });

    describe('with an invalid filename', () => {
      it('should return a bad request response', async () => {
        const response = await handleRequest({
          url: `${TEST_WORKER_BASE_URL}/${TEST_VALID_CID}/file?.jpg`,
        });
        expect(response.status).toBe(400);
      });
    });

    describe('with an invalid file extension', () => {
      it('should return a bad request response', async () => {
        const response = await handleRequest({
          url: `${TEST_WORKER_BASE_URL}/${TEST_VALID_CID}/file.exec`,
        });
        expect(response.status).toBe(400);
      });
    });

    describe('with a valid cid and filename', () => {
      describe('and the file request fails', () => {
        beforeEach(() => {
          global.fetch = () => Promise.reject();
        });

        it('should return a bad gateway response', async () => {
          const response = await handleRequest({
            url: `${TEST_WORKER_BASE_URL}/${TEST_VALID_CID}/file.jpg`,
          });
          expect(response.status).toBe(502);
        });
      });

      describe('and the file request succeeds', () => {
        describe('but without a ok response', () => {
          beforeEach(() => {
            global.fetch = () =>
              (Promise as any).resolve({
                ok: false,
                arrayBuffer: () => new ArrayBuffer(16),
              });
          });
          it('should return a bad gateway response', async () => {
            const response = await handleRequest({
              url: `${TEST_WORKER_BASE_URL}/${TEST_VALID_CID}/file.jpeg`,
            });
            expect(response.status).toBe(502);
          });
        });

        describe('and with a ok response', () => {
          let encryptedFile, decryptedFile;

          beforeEach(() => {
            encryptedFile = fs.readFileSync(
              `${__dirname}/test-encrypted-file.png`
            );
            decryptedFile = fs.readFileSync(
              `${__dirname}/test-decrypted-file.png`
            );
            global.fetch = () =>
              (Promise as any).resolve({
                ok: true,
                headers: TEST_DECRYPTED_FILE_HEADERS,
                arrayBuffer: () => encryptedFile,
              });
          });
          it('should return a decrypted file with an ok response and corresponding headers', async () => {
            const response = await handleRequest({
              url: `${TEST_WORKER_BASE_URL}/${TEST_VALID_CID}/file.png`,
            });
            // It's necessary to have the salt env variable for the next assertions to pass:
            expect(process.env.FILE_ENCRYPTION_SALT).toBeDefined();

            const decryptedFileSuccessfully =
              Buffer.compare(response.body, decryptedFile) === 0;
            expect(decryptedFileSuccessfully).toBeTruthy();
            expect(response.headers).toBe(TEST_DECRYPTED_FILE_HEADERS);
            expect(response.status).toBe(200);
          });
        });
      });
    });
  });
});
