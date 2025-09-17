/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import AWS from 'aws-sdk';
import MailComposer from 'nodemailer/lib/mail-composer';
import * as fs from 'fs';
import Handlebars from 'handlebars';

const CONFIG = {
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
};

@Injectable()
export class AwsService {
  isEmailServiceEnabled() {
    return process.env.IS_EMAIL_ENABLED?.toLowerCase() === 'true';
  }
  async sendEmail(templateName, includeAdmins, toAddresses, data) {
    try {
      if (!this.isEmailServiceEnabled()) return null;
      const AWS_SES = new AWS.SES(CONFIG);
      const adminEmailIdsFromEnv = process.env.SES_ADMIN_EMAIL_IDS;
      const adminEmailIds = adminEmailIdsFromEnv?.split('|') ?? [];
      const additionalEmailIds = includeAdmins ? [...adminEmailIds] : [];
      const params: any = {
        Source: process.env.SES_SOURCE_EMAIL,
        Destination: {
          ToAddresses: [...toAddresses, ...additionalEmailIds],
        },
        Template: templateName /* required */,
        TemplateData: JSON.stringify({ ...data }) /* required */,
      };
      const promiseData = AWS_SES.sendTemplatedEmail(params).promise();
      await promiseData;
    } catch (e) {
      console.error(e);
    }
  }

  async sendEmailWithTemplate(
    templateName: string,
    data,
    textTemplate: string,
    subject: string,
    fromAddress: string,
    toAddresses: string[],
    ccAddresses: string[],
    replyTo?: string,
    isEmailEnabled = this.isEmailServiceEnabled()
  ) {
    if (!isEmailEnabled) return null;
    const emailTemplate = fs.readFileSync(templateName, 'utf-8');
    Handlebars.registerHelper('eq', (valueOne, valueTwo) => {
      return valueOne === valueTwo;
    });
    Handlebars.registerHelper('and', function (...args) {
      return args.every(Boolean);
    });
    const template = Handlebars.compile(emailTemplate);
    const renderedHtml = template(data);
    const AWS_SES = new AWS.SES(CONFIG);
    const mailOptions = {
      from: fromAddress,
      to: toAddresses,
      cc: ccAddresses,
      subject: subject,
      html: renderedHtml,
      text: textTemplate,
      replyTo: replyTo,
    };
    const mail = new MailComposer(mailOptions);
    // Compose the email with attachment
    const rawMessage: any = await new Promise((resolve, reject) => {
      mail.compile().build((err, rawMessage) => {
        if (err) {
          reject(err);
        } else {
          resolve(rawMessage);
        }
      });
    });
    const encodedMessage = Buffer.from(rawMessage).toString();
    const params = {
      Destinations: [...toAddresses, ...ccAddresses],
      RawMessage: {
        Data: encodedMessage,
      },
    };
    // Send the email with attachment using RawMessage
    return await AWS_SES.sendRawEmail(params).promise();
  }

  async uploadFileToS3(file, bucketName, fileName: string) {
    if (
      process.env.ENVIRONMENT === 'development' &&
      (!bucketName || !CONFIG.accessKeyId || !CONFIG.secretAccessKey || !CONFIG.region)
    ) {
      return {
        Location: '',
      };
    }
    const s3 = new AWS.S3(CONFIG);
    const params = {
      Bucket: bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    return await s3.upload(params).promise();
  }

  async getPresignedGetUrl(bucket?: string, key?: string, expiresInSeconds = 3600) {
    const s3 = new AWS.S3(CONFIG);
    return s3.getSignedUrl('getObject', { Bucket: bucket, Key: key, Expires: expiresInSeconds });
  }

  async getSignedGetUrl(
    bucket: string,
    key: string,
    ttlSec: number,
    opts?: { disposition?: 'inline' | 'attachment'; filename?: string; contentType?: string }
  ) {
    const s3 = new AWS.S3(CONFIG);
    return s3.getSignedUrlPromise('getObject', {
      Bucket: bucket,
      Key: key,
      Expires: ttlSec,
      ResponseContentDisposition: opts?.disposition
        ? `${opts.disposition}; filename="${encodeURIComponent(opts.filename || key.split('/').pop()!)}"`
        : undefined,
      ResponseContentType: opts?.contentType,
    });
  }

  async generatePresignedPutUrl(bucket: string, key: string, contentType: string, expiresInSeconds: number = 900) {
    const s3 = new AWS.S3(CONFIG);
    return s3.getSignedUrlPromise('putObject', {
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Expires: expiresInSeconds,
    });
  }

  async checkObjectExists(bucket: string, key: string): Promise<boolean> {
    try {
      const s3 = new AWS.S3(CONFIG);
      await s3.headObject({ Bucket: bucket, Key: key }).promise();
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }
  
  /**
   * Updates an record in DynamoDB table
   * 
   * @param params - DynamoDB update parameters
   * @returns Promise with the update result
   */
  async updateRecordInDynamoDB(params: AWS.DynamoDB.DocumentClient.UpdateItemInput): Promise<any> {
    if (!params.TableName) {
      throw new Error('DynamoDB table name is required');
    }
    const dynamoDb = new AWS.DynamoDB.DocumentClient(CONFIG);
    return await dynamoDb.update(params).promise();
  }
}
