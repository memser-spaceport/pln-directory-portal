import fs from 'fs';
import { createDecipheriv, createHash, hkdfSync } from 'crypto';
// Explicitly import multer to temporarily fix this issue:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/47780
import 'multer';
import {
  FILE_ENCRYPTION_CIPHER,
  FILE_ENCRYPTION_HKDF_INFO,
  FILE_ENCRYPTION_MARKER,
  FileEncryptionService,
} from './file-encryption.service';

const TEST_PASSWORD = 'test-file-encryption-password';
const TEST_SALT = 'test-file-encryption-salt';

function makeFile(): Express.Multer.File {
  const filePath = `${__dirname}/__mocks__/test.png`;
  return {
    path: filePath,
    size: 10,
    filename: `test.png`,
    buffer: fs.readFileSync(filePath),
    destination: '',
    fieldname: 'file',
    mimetype: 'image/png',
    originalname: `test.png`,
    stream: fs.createReadStream(filePath),
    encoding: '7bit',
  };
}

function decrypt(encrypted: Buffer, key: Buffer) {
  const iv = encrypted.subarray(FILE_ENCRYPTION_MARKER.length, FILE_ENCRYPTION_MARKER.length + 16);
  const ciphertext = encrypted.subarray(FILE_ENCRYPTION_MARKER.length + 16);
  const decipher = createDecipheriv(FILE_ENCRYPTION_CIPHER, key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const derivedKey = () => Buffer.from(hkdfSync('sha256', TEST_PASSWORD, TEST_SALT, FILE_ENCRYPTION_HKDF_INFO, 32));
const legacyKey = () => createHash('sha256').update(TEST_SALT).digest().subarray(0, 32);

describe('FileEncryptionService', () => {
  const originalEnv = { ...process.env };
  let fileEncryptionService: FileEncryptionService;

  beforeEach(() => {
    process.env.FILE_ENCRYPTION_PASSWORD = TEST_PASSWORD;
    process.env.FILE_ENCRYPTION_SALT = TEST_SALT;
    fileEncryptionService = new FileEncryptionService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('When encrypting a file', () => {
    it('decrypts back to the original bytes with the derived key', () => {
      const original = Buffer.from(makeFile().buffer);
      const encrypted = fileEncryptionService.getEncryptedFile(makeFile()).buffer;

      expect(encrypted.equals(original)).toBe(false);
      expect(decrypt(encrypted, derivedKey()).equals(original)).toBe(true);
    });

    it('starts with the version marker followed by a 16-byte IV', () => {
      const original = makeFile().buffer;
      const encrypted = fileEncryptionService.getEncryptedFile(makeFile()).buffer;

      expect(encrypted.subarray(0, 8).toString('ascii')).toBe('PLNENC02');
      expect(encrypted.length).toBe(8 + 16 + original.length);
    });

    it('produces a different ciphertext each time', () => {
      const first = fileEncryptionService.getEncryptedFile(makeFile()).buffer;
      const second = fileEncryptionService.getEncryptedFile(makeFile()).buffer;

      expect(first.equals(second)).toBe(false);
    });

    it('cannot be read with the legacy sha256(salt) key', () => {
      const original = Buffer.from(makeFile().buffer);
      const encrypted = fileEncryptionService.getEncryptedFile(makeFile()).buffer;

      expect(decrypt(encrypted, legacyKey()).equals(original)).toBe(false);
    });

    it('throws when the password is missing', () => {
      delete process.env.FILE_ENCRYPTION_PASSWORD;

      expect(() => fileEncryptionService.getEncryptedFile(makeFile())).toThrow(/FILE_ENCRYPTION_PASSWORD/);
    });

    it('throws when the salt is empty', () => {
      process.env.FILE_ENCRYPTION_SALT = '';

      expect(() => fileEncryptionService.getEncryptedFile(makeFile())).toThrow(/FILE_ENCRYPTION_SALT/);
    });
  });
});
