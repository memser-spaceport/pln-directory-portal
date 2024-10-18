import { AwsService } from './aws.service';
import AWS from 'aws-sdk';
import * as fs from 'fs';
import Handlebars from 'handlebars';

jest.mock('aws-sdk');
jest.mock('fs');
jest.mock('nodemailer/lib/mail-composer');

describe('AwsService', () => {
  let awsService: AwsService;
  let sendTemplatedEmailMock;
  let sendRawEmailMock;
  let s3UploadMock;
  let compileMock;
  let mailCompileMock;
  beforeEach(() => {
    awsService = new AwsService();

    sendTemplatedEmailMock = jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue('Success'),
    });
    sendRawEmailMock = jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Destinations: ['email-1@mail.com'],
        RawMessage: {
          Data: 'RawMessage'
        }
      }),
    });
    (AWS.SES as unknown as jest.Mock).mockImplementation(() => ({
      sendTemplatedEmail: sendTemplatedEmailMock,
      sendRawEmail: sendRawEmailMock,
    }));

    s3UploadMock = jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Location: 's3-location-url' }),
    });
    (AWS.S3 as unknown as jest.Mock).mockImplementation(() => ({
      upload: s3UploadMock,
    }));
    jest.spyOn(fs, 'readFileSync').mockReturnValue('<html>{{eq name "John"}}</html>');
  });

  describe('sendEmail', () => {
    it('should send email with specific template with  SES_ADMIN_EMAIL_IDS  ', async () => {
      const toAddresses = ['email-1@mail.com'];
      const data = { name: 'John Doe' };

      await awsService.sendEmail('MyTemplate', true, toAddresses, data);
      process.env.SES_ADMIN_EMAIL_IDS = 'admin1@example.com|admin2@example.com';

      expect(sendTemplatedEmailMock).toHaveBeenCalledWith({
        Source: process.env.SES_SOURCE_EMAIL,
        Destination: {
          ToAddresses: toAddresses.concat(process.env.SES_ADMIN_EMAIL_IDS?.split('|') ?? []),
        },
        Template: 'MyTemplate',
        TemplateData: JSON.stringify(data),
      });
    });
    it('should send email with specific template without SES_ADMIN_EMAIL_IDS ', async () => {
      const toAddresses = ['email-1@mail.com'];
      const data = { name: 'John Doe' };

      await awsService.sendEmail('MyTemplate', true, toAddresses, data);
      process.env.SES_ADMIN_EMAIL_IDS = '';

      expect(sendTemplatedEmailMock).toHaveBeenCalledWith({
        Source: process.env.SES_SOURCE_EMAIL,
        Destination: {
          ToAddresses: toAddresses.concat(process.env.SES_ADMIN_EMAIL_IDS?.split('|') ?? []),
        },
        Template: 'MyTemplate',
        TemplateData: JSON.stringify(data),
      });
    });

    it('should send email with specific template with include admin false ', async () => {
      const toAddresses = ['email-1@mail.com'];
      const data = { name: 'John Doe' };

      await awsService.sendEmail('MyTemplate', false, toAddresses, data);
      process.env.SES_ADMIN_EMAIL_IDS = '';

      expect(sendTemplatedEmailMock).toHaveBeenCalledWith({
        Source: process.env.SES_SOURCE_EMAIL,
        Destination: {
          ToAddresses: toAddresses.concat(process.env.SES_ADMIN_EMAIL_IDS?.split('|') ?? []),
        },
        Template: 'MyTemplate',
        TemplateData: JSON.stringify(data),
      });
    });

    it('should handle errors gracefully', async () => {
      sendTemplatedEmailMock.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Email failed')),
      });

      const toAddresses = ['test@example.com'];
      const data = { name: 'John Doe' };

      await expect(awsService.sendEmail('MyTemplate', true, toAddresses, data)).resolves.toBeUndefined(); // Catch errors gracefully in the method

      expect(sendTemplatedEmailMock).toHaveBeenCalled();
    });
  });

  describe('sendEmailWithTemplate', () => {
    it('should successfully send email with a template', async () => {
      const templateName = 'emailTemplate';
      const data = {};
      const textTemplate = 'textTemplate';
      const subject = 'Test Email';
      const fromAddress = 'email-1@mail.com';
      const toAddresses = ['email-2@mail.com'];
      const ccAddresses = ['email-3@mail.com'];

      const result = await awsService.sendEmailWithTemplate(
        templateName,
        data,
        textTemplate,
        subject,
        fromAddress,
        toAddresses,
        ccAddresses
      );

      expect(fs.readFileSync).toHaveBeenCalledWith(templateName, 'utf-8');
      expect(Handlebars.compile).toHaveBeenCalledWith('<html>{{name}}</html>');
      expect(Handlebars.registerHelper).toHaveBeenCalledWith(true);
      expect(compileMock).toHaveBeenCalledWith(data);
      expect(mailCompileMock).toHaveBeenCalled();
      expect(sendRawEmailMock).toHaveBeenCalledWith({
        Destinations: [...toAddresses, ...ccAddresses],
        RawMessage: {
          Data: Buffer.from('rawMessageContent').toString(),
        },
      });
      const rawMessage = 'rawMessageContent';
      const encodedMessage = Buffer.from(rawMessage).toString();
      expect(Buffer.from).toHaveBeenCalledWith(rawMessage);
      expect(encodedMessage).toBe('rawMessageContent');
      expect(result).toBe('Success');
      expect(sendTemplatedEmailMock).toHaveBeenCalledWith({
        Destination: ['email-1@mail.com'],
        RawMessage: encodedMessage,
      });
    });
  });
  it('should handle error during mail compilation (Promise rejection case)', async () => {
    mailCompileMock.mockImplementationOnce((callback) => {
      callback(new Error('Mail compilation failed'), null); 
    });

    const templateName = 'emailTemplate.html';
    const data = { name: 'John' };
    const textTemplate = 'Text version of the email';
    const subject = 'Test Email';
    const fromAddress = 'no-reply@example.com';
    const toAddresses = ['john@example.com'];
    const ccAddresses = ['jane@example.com'];

    await expect(
      awsService.sendEmailWithTemplate(templateName, data, textTemplate, subject, fromAddress, toAddresses, ccAddresses)
    ).rejects.toThrow('Mail compilation failed');
  });

  describe('AwsService - uploadFileToS3', () => {
    it('should upload a file to S3 successfully', async () => {
      const file = {
        buffer: Buffer.from('test file content'),
        mimetype: 'image/jpeg',
      };
      const bucketName = 'my-bucket';
      const fileName = 'file-name.jpg';

      const result = await awsService.uploadFileToS3(file, bucketName, fileName);

      expect(AWS.S3).toHaveBeenCalledWith({
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
        region: process.env.AWS_REGION,
      });

      expect(s3UploadMock).toHaveBeenCalledWith({
        Bucket: bucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      expect(result).toEqual({
        Location: 'https://s3.amazonaws.com/my-bucket/file-name',
      });
    });
  });
});
