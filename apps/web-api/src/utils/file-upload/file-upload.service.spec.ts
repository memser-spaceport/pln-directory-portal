// Explicitly import multer to temporarily fix this issue:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/47780
import 'multer';
import { Readable } from 'stream';
import { FileEncryptionService } from '../file-encryption/file-encryption.service';
import { FileUploadService } from './file-upload.service';

const TEST_FILE_STORED_CID = 'cid';

jest.mock('web3.storage', () => {
  const { Web3Storage } = jest.requireActual('web3.storage');
  return {
    ...Web3Storage,
    Web3Storage: jest.fn().mockImplementation(() => ({
      put: jest.fn().mockImplementation(() => TEST_FILE_STORED_CID),
    })),
    File: jest.fn().mockImplementation((stream, name) => {
      return {
        stream: stream,
        name: name,
      };
    }),
  };
});
jest.mock('../file-encryption/file-encryption.service', () => ({
  FileEncryptionService: jest.fn().mockImplementation(() => ({
    getEncryptedFile: jest.fn().mockImplementation((file) => file),
  })),
}));

describe('FileUploadService', () => {
  let fileUploadService: FileUploadService;
  let fileEncryptionService: FileEncryptionService;

  beforeEach(() => {
    fileEncryptionService = new FileEncryptionService();
    fileUploadService = new FileUploadService(fileEncryptionService);
  });

  describe('When storing files', () => {
    it('should encrypt the files and return a CID', async () => {
      const file: Express.Multer.File = {
        buffer: Buffer.from('Hello World'),
        originalname: 'hello.txt',
        destination: '',
        fieldname: '',
        filename: '',
        encoding: '',
        mimetype: '',
        size: 0,
        path: '',
        stream: new Readable(),
      };
      const cid = await fileUploadService.storeFiles([file]);
      expect(fileEncryptionService.getEncryptedFile).toBeCalledTimes(1);
      expect(cid).toEqual(TEST_FILE_STORED_CID);
    });
  });
});
