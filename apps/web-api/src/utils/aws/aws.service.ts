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
  async sendEmail(templateName, includeAdmins, toAddresses, data) {
    try {
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
    ccAddresses: string[]
  ) {
    const emailTemplate = fs.readFileSync(
      templateName,
      'utf-8'
    );
    Handlebars.registerHelper('eq', (valueOne, valueTwo) => { return valueOne === valueTwo })
    const template = Handlebars.compile(emailTemplate);
    const renderedHtml = template(data);
    const AWS_SES = new AWS.SES(CONFIG);
    const mailOptions = {
      from: fromAddress,
      to: toAddresses,
      cc: ccAddresses,
      subject: subject,
      html: renderedHtml,
      text: textTemplate
    };
    const mail = new MailComposer(mailOptions);
    // Compose the email with attachment
    const rawMessage:any = await new Promise((resolve, reject) => {
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
    const s3 = new AWS.S3(CONFIG);
    const params = {
      Bucket: bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    return await s3.upload(params).promise();
  }
}
