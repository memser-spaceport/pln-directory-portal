import { Injectable } from '@nestjs/common';
// Explicitly import multer to temporarily fix this issue:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/47780
import 'multer';
import { AwsService } from '../aws/aws.service';
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
  constructor(private awsService:AwsService) {}

  async storeImageFiles(uploadedFiles: Array<Express.Multer.File>) {
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

  // Single-file store that returns a secure URL (presigned GET by default).
  async storeOneAndGetSecureUrl(
    file: Express.Multer.File,
    opts?: { prefix?: string; signed?: boolean; ttlSec?: number },
  ): Promise<{ url: string; storage: 's3'; keyOrPath: string; bucket?: string }> {
    const prefix = opts?.prefix ?? 'uploads';
    const signed = opts?.signed ?? true;
    const ttlSec = Math.max(30, Number(opts?.ttlSec ?? 3600)); // default 1h for this helper

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
