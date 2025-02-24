import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { S3 } from 'aws-sdk';

@Processor('document-processing')
export class DocumentProcessor {
  private readonly logger = new Logger(DocumentProcessor.name);
  private s3: S3;

  constructor() {
    this.s3 = new S3({
      region: process.env.AWS_REGION,
    });
  }

  @Process('process-document')
  async processDocument(
    job: Job<{
      s3Url: string;
      originalName: string;
      mimeType: string;
    }>
  ) {
    try {
      const s3Key = this.getKeyFromS3Url(job.data.s3Url);
      const documentBuffer = await this.downloadFromS3(s3Key);
      const documentText = documentBuffer.toString('utf-8');

      // TODO: Process the document

      return {
        success: true,
        jobId: job.id,
        documentContent: documentText,
        mimeType: job.data.mimeType,
        originalName: job.data.originalName,
      };
    } catch (error) {
      this.logger.error(`Failed to process document: ${error.message}`);
      throw error;
    }
  }

  private getKeyFromS3Url(s3Url: string): string {
    const url = new URL(s3Url);
    return url.pathname.substring(1);
  }

  private async downloadFromS3(key: string): Promise<Buffer> {
    const response = await this.s3
      .getObject({
        Bucket: process.env.AWS_S3_BUCKET_NAME || '',
        Key: key,
      })
      .promise();

    return response.Body as Buffer;
  }
}
