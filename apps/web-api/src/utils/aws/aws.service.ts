/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import AWS from 'aws-sdk';
const SES_CONFIG = {
  accessKeyId: 'AKIAQGFDYLGEHP4SKH3N',
  secretAccessKey: '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',
  region: 'us-west-1',
};

@Injectable()
export class AwsService {
  async sendEmail(templateName, toAddresses, data) {
    const AWS_SES = new AWS.SES(SES_CONFIG);
    const params = {
      Source: 'member-services@plnetwork.io',
      Destination: {
        ToAddresses: toAddresses,
      },

      Template: templateName /* required */,
      TemplateData: JSON.stringify({ ...data }) /* required */,
    };
    const promiseData = AWS_SES.sendTemplatedEmail(params).promise();
    // const promiseData = AWS_SES.sendEmail(params).promise()
    const sendReponse = await promiseData;
    console.log(sendReponse);
  }
}
