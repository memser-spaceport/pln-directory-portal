import { FileUploadService } from './file-upload.service';
import { FileEncryptionService } from '../file-encryption/file-encryption.service';
import { AwsService } from '../aws/aws.service';
import { Web3Storage } from 'web3.storage';
import { IPFS } from '../constants';

jest.mock('web3.storage');

const mockFileEncryptionService = {
  getEncryptedFile: jest.fn(),
};

const mockAwsService = {
  uploadFileToS3: jest.fn(),
};

describe('FileUploadService', () => {
  let fileUploadService: FileUploadService;

  beforeEach(() => {
    fileUploadService = new FileUploadService(
      mockFileEncryptionService as any,
      mockAwsService as any
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('storeFiles', () => {
    it('should store files on IPFS when FILE_STORAGE is set to IPFS', async () => {
      process.env.FILE_STORAGE = IPFS;
      process.env.WEB3_STORAGE_API_TOKEN = 'dummy-token';

      const mockCid = 'mocked-cid';
      const mockPut = jest.fn().mockResolvedValue(mockCid);

      (Web3Storage as unknown as jest.Mock).mockImplementation(() => ({
        put: mockPut,
      }));

      const uploadedFiles = [
        {
          originalname: 'testfile.txt',
          buffer: Buffer.from('test content'),
        },
      ];
      mockFileEncryptionService.getEncryptedFile.mockReturnValue({
        originalname: 'testfile.txt',
        buffer: Buffer.from('encrypted content'),
      });
      const result = await fileUploadService.storeFiles(uploadedFiles as any);

      expect(Web3Storage).toHaveBeenCalledWith({
        token: 'dummy-token',
        endpoint: new URL('https://api.web3.storage'),
      });
      expect(mockFileEncryptionService.getEncryptedFile).toHaveBeenCalledWith(
        uploadedFiles[0]
      );
      expect(mockPut).toHaveBeenCalled();
      expect(result).toBe(mockCid);
    });

    it('should store files on AWS S3 when FILE_STORAGE is not IPFS', async () => {
      process.env.FILE_STORAGE = 'S3';
      process.env.AWS_S3_BUCKET_NAME = 'test-bucket';
      const uploadedFiles = [
        {
          originalname: 'testfile.txt',
          buffer: Buffer.from('test content'),
          mimetype: 'text/plain',
        },
      ];
      const mockS3Response = { Location: 'https://s3.amazonaws.com/testfile.txt' };
      mockAwsService.uploadFileToS3.mockResolvedValue(mockS3Response);
      const result = await fileUploadService.storeFiles(uploadedFiles as any);
      expect(mockAwsService.uploadFileToS3).toHaveBeenCalledWith(
        uploadedFiles[0],
        'test-bucket',
        'testfile.txt'
      );
      expect(result).toBe(mockS3Response.Location);
    });
  });

  describe('getDecryptedFileUrl', () => {
    it('should return the correct file URL', async () => {
      process.env.WORKER_IMAGE_URL = 'https://worker.example.com';
      const cid = 'mocked-cid';
      const filename = 'testfile.txt';
      const result = await fileUploadService.getDecryptedFileUrl(cid, filename);
      expect(result).toBe('https://worker.example.com/mocked-cid/testfile.txt');
    });
  });
});
