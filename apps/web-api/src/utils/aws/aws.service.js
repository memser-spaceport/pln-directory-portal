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
  async sendEmail(toAddresses, subject, message) {
    const AWS_SES = new AWS.SES(SES_CONFIG);
    let params = {
      Source: 'member-services@plnetwork.io',
      Destination: {
        ToAddresses: toAddresses,
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: message,
          },
        },
        Subject: {
          Charset: 'UTF-8',
          Data: subject,
        },
      },
    };
    await AWS_SES.sendEmail(params);
    console.log('no error');
  }
}
