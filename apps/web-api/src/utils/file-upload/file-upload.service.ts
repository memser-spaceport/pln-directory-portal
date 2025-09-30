import { Injectable } from '@nestjs/common';
import { File, Web3Storage } from 'web3.storage';

// Explicitly import multer to temporarily fix this issue:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/47780
import 'multer';
import { FileEncryptionService } from '../file-encryption/file-encryption.service';
import { AwsService } from '../aws/aws.service';
import { IPFS } from '../constants';
import * as path from 'path';
import { createHash } from 'crypto';

function hashName(name: string) {
  return createHash('sha1').update(name + ':' + Date.now()).digest('hex');
}
function fileExt(name: string) {
  const ext = path.extname(name);
  return ext || '';
}

@Injectable()
export class FileUploadService {
  constructor(private fileEcryptionService: FileEncryptionService, private awsService:AwsService) {}

  private makeStorageClient() {
    console.log("Inside makeStorageClient");
    return new Web3Storage({
      token: process.env.WEB3_STORAGE_API_TOKEN || '',
      endpoint: new URL('https://api.web3.storage'),
    });
  }

  private makeFileObjects(files: Array<Express.Multer.File>) {
    return files.map((file) => new File([file.buffer], `${file.originalname}`));
  }

  private encryptFiles(files: Array<Express.Multer.File>) {
    return files.map((file) => this.fileEcryptionService.getEncryptedFile(file));
  }

  async storeImageFiles(uploadedFiles: Array<Express.Multer.File>) {
    if (process.env.FILE_STORAGE === IPFS) {
      const client = this.makeStorageClient();
      const encryptedFiles = this.encryptFiles(uploadedFiles);
      const fileObjects = this.makeFileObjects(encryptedFiles);
      const cid = await client.put(fileObjects);
      return cid;
    } else {
      let response;
      for (const file of uploadedFiles) {
        if (!response) {
          response = await this.awsService.uploadFileToS3(file, process.env.AWS_S3_IMAGE_BUCKET_NAME , file.originalname);
        } else {
          await this.awsService.uploadFileToS3(file, process.env.AWS_S3_IMAGE_BUCKET_NAME , file.originalname);
        }
      }
      return response.Location;
    }
  }

  async getDecryptedFileUrl(cid: string, filename: string) {
    return `${process.env.WORKER_IMAGE_URL}/${cid}/${filename}`;
  }

  // New: single-file store that returns a secure URL (worker URL for IPFS or presigned GET for S3).
  async storeOneAndGetSecureUrl(
    file: Express.Multer.File,
    opts?: { prefix?: string; signed?: boolean; ttlSec?: number },
  ): Promise<{ url: string; storage: 'ipfs' | 's3'; keyOrPath: string; bucket?: string }> {
    const prefix = opts?.prefix ?? 'uploads';
    const signed = opts?.signed ?? true;
    const ttlSec = Math.max(30, Number(opts?.ttlSec ?? 3600)); // default 1h for this helper

    if (process.env.FILE_STORAGE === IPFS) {
      const client = this.makeStorageClient();
      const enc = this.encryptFiles([file]);
      const fileObjs = this.makeFileObjects(enc);
      const cid = await client.put(fileObjs);
      const url = await this.getDecryptedFileUrl(cid, file.originalname);
      return { url, storage: 'ipfs', keyOrPath: `${cid}/${file.originalname}` };
    }

    // Resolve ONE bucket consistently for S3 uploads
    const bucket =
      process.env.AWS_S3_UPLOAD_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET_NAME;

    if (!bucket) {
      throw new Error('No S3 bucket configured (AWS_S3_UPLOAD_BUCKET_NAME or AWS_S3_BUCKET_NAME)');
    }

    const safeName = `${hashName(file.originalname)}${fileExt(file.originalname)}`;
    const key = `${prefix}/${safeName}`;

    // Upload the file
    const resp = await this.awsService.uploadFileToS3(file, bucket, key);

    // Optionally return a short-lived GET URL (convenient for immediate preview)
    if (signed) {
      const signedUrl = await this.awsService.getSignedGetUrl(bucket, key, ttlSec, {
        disposition: 'inline',
        filename: file.originalname,
        contentType: file.mimetype,
      });
      return { url: signedUrl, storage: 's3', keyOrPath: key, bucket };
    }

    // Otherwise, return the S3 object location
    return { url: resp.Location, storage: 's3', keyOrPath: key, bucket };
  }
}
