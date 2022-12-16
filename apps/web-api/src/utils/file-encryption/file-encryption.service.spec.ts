import fs from 'fs';
// Explicitly import multer to temporarily fix this issue:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/47780
import 'multer';
import { FileEncryptionService } from './file-encryption.service';

jest.mock('crypto-browserify', () => {
  const crypto = jest.requireActual('crypto-browserify');
  return {
    ...crypto,
    createHash: jest.fn().mockImplementation(() => ({
      ...crypto.createHash,
      update: jest.fn().mockImplementation(() => ({
        digest: jest.fn().mockImplementation(() => Buffer.from('test')),
      })),
      digest: jest.fn().mockImplementation(() => Buffer.from('test')),
    })),
    randomBytes: jest.fn().mockImplementation(() => Buffer.from('random')),
    createCipheriv: jest.fn().mockImplementation(() => ({
      update: jest.fn().mockImplementation(() => Buffer.from('updated')),
      final: jest.fn().mockImplementation(() => Buffer.from('encrypted')),
    })),
  };
});

describe('FileEncryptionService', () => {
  let fileEncryptionService: FileEncryptionService;

  beforeEach(() => {
    fileEncryptionService = new FileEncryptionService();
  });

  describe('When encrypting a file', () => {
    it('should encrypt the file', () => {
      const filePath = `${__dirname}/__mocks__/test.png`;
      const file = {
        path: filePath,
        size: 10,
        filename: `test.png`,
        buffer: fs.readFileSync(filePath),
        destination: '',
        fieldname: 'file',
        mimetype: 'image/webp',
        originalname: `test.png`,
        stream: fs.createReadStream(filePath),
        encoding: '7bit',
      };
      // Had to to this because the buffer was being modified by the encryption
      const previousBuffer = file.buffer;
      const encryptedFile = fileEncryptionService.getEncryptedFile(file);
      expect(encryptedFile.buffer).not.toEqual(previousBuffer);
    });
  });
});
