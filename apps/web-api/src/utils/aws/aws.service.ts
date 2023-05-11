/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import AWS from 'aws-sdk';
const SES_CONFIG = {
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
};

@Injectable()
export class AwsService {
  async sendEmail(templateName, includeAdmins, toAddresses, data) {
    try {
      const AWS_SES = new AWS.SES(SES_CONFIG);
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
}
