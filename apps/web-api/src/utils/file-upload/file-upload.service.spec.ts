// Explicitly import multer to temporarily fix this issue:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/47780
import 'multer';
import { Readable } from 'stream';
import { AwsService } from '../aws/aws.service';
import { FileUploadService } from './file-upload.service';

const TEST_S3_LOCATION = 'https://bucket.s3.amazonaws.com/hello.txt';

function makeFile(): Express.Multer.File {
  return {
    buffer: Buffer.from('Hello World'),
    originalname: 'hello.txt',
    destination: '',
    fieldname: '',
    filename: '',
    encoding: '',
    mimetype: 'text/plain',
    size: 11,
    path: '',
    stream: new Readable(),
  };
}

describe('FileUploadService', () => {
  const originalEnv = { ...process.env };
  let awsService: { uploadFileToS3: jest.Mock; getSignedGetUrl: jest.Mock };
  let fileUploadService: FileUploadService;

  beforeEach(() => {
    awsService = {
      uploadFileToS3: jest.fn().mockResolvedValue({ Location: TEST_S3_LOCATION }),
      getSignedGetUrl: jest.fn().mockResolvedValue('https://signed.example/hello.txt'),
    };
    fileUploadService = new FileUploadService(awsService as unknown as AwsService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('When storing image files', () => {
    it('uploads to S3 unencrypted and returns the location, even if FILE_STORAGE is ipfs', async () => {
      process.env.FILE_STORAGE = 'ipfs';
      process.env.AWS_S3_IMAGE_BUCKET_NAME = 'images-bucket';
      const file = makeFile();

      const location = await fileUploadService.storeImageFiles([file]);

      expect(awsService.uploadFileToS3).toHaveBeenCalledWith(file, 'images-bucket', 'hello.txt');
      expect(awsService.uploadFileToS3.mock.calls[0][0].buffer.toString()).toBe('Hello World');
      expect(location).toBe(TEST_S3_LOCATION);
    });
  });

  describe('When storing one file with a secure URL', () => {
    it('uploads to S3 and returns a signed URL', async () => {
      process.env.AWS_S3_UPLOAD_BUCKET_NAME = 'uploads-bucket';

      const result = await fileUploadService.storeOneAndGetSecureUrl(makeFile(), { prefix: 'uploads/test' });

      expect(result.storage).toBe('s3');
      expect(result.bucket).toBe('uploads-bucket');
      expect(result.keyOrPath).toMatch(/^uploads\/test\/[0-9a-f]{40}\.txt$/);
      expect(result.url).toBe('https://signed.example/hello.txt');
    });
  });
});
