import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { FaqService } from './faq.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { AwsService } from '../utils/aws/aws.service';
import { CustomQuestionSchemaDto } from 'libs/contracts/src/schema';
import {
  ASK_QUESTION,
  ASK_QUESTION_SUBJECT,
  FEEDBACK,
  FEEDBACK_SUBJECT,
  SHARE_IDEA,
  SHARE_IDEA_SUBJECT,
  SUPPORT,
  SUPPORT_SUBJECT,
} from '../utils/constants';
import path from 'path';
import { SendRawEmailResponse } from 'aws-sdk/clients/ses';

describe('FaqService', () => {
  let faqService: FaqService;
  let prismaService: PrismaService;
  let logService: LogService;
  let awsService: AwsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqService,
        { provide: PrismaService, useValue: { faq: { create: jest.fn() } } },
        { provide: LogService, useValue: { info: jest.fn(), error: jest.fn() } },
        { provide: AwsService, useValue: { sendEmailWithTemplate: jest.fn() } },
      ],
    }).compile();

    faqService = module.get<FaqService>(FaqService);
    prismaService = module.get<PrismaService>(PrismaService);
    logService = module.get<LogService>(LogService);
    awsService = module.get<AwsService>(AwsService);

    process.env.IS_EMAIL_ENABLED = 'true';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addQuestion', () => {
    it('should save a new FAQ question and send notification', async () => {
      const question: CustomQuestionSchemaDto = {
        email: 'user@example.com',
        question: 'What is the return policy?',
        type: 'ASK_QUESTION',
      };
      const requestIP = '127.0.0.1';
      const mockResult = { uid: 'faq_123' };

      // Mock Prisma method
      (prismaService.faq.create as jest.Mock).mockResolvedValue(mockResult);
      jest.spyOn(faqService, 'notifyNewCustomQuestion').mockResolvedValueOnce();

      const result = await faqService.addQuestion(question, requestIP);

      expect(prismaService.faq.create).toHaveBeenCalledWith({
        data: {
          email: question.email,
          question: question.question,
          type: question.type,
          requestIp: requestIP,
        },
      });
      expect(faqService.notifyNewCustomQuestion).toHaveBeenCalledWith(mockResult);
      expect(logService.info).toHaveBeenCalledWith(
        `New faq question request created from ${question.email} with ref id ${mockResult.uid}`
      );
      expect(result).toBe(true);
    });

    it('should throw an error if the FAQ question cannot be saved', async () => {
      const question: CustomQuestionSchemaDto = {
        email: 'user@example.com',
        question: 'What is the return policy?',
        type: 'ASK_QUESTION',
      };
      const requestIP = '127.0.0.1';

      // Mock the Prisma create method to throw an error
      (prismaService.faq.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(faqService.addQuestion(question, requestIP)).rejects.toThrow(InternalServerErrorException);
      expect(logService.info).not.toHaveBeenCalled();
    });
  });

  describe('getEmailSubjectByType', () => {
    it('should return ASK_QUESTION_SUBJECT for type ASK_QUESTION', () => {
      const result = faqService.getEmailSubjectByType(ASK_QUESTION);
      expect(result).toBe(ASK_QUESTION_SUBJECT);
    });

    it('should return SUPPORT_SUBJECT for type SUPPORT', () => {
      const result = faqService.getEmailSubjectByType(SUPPORT);
      expect(result).toBe(SUPPORT_SUBJECT);
    });

    it('should return FEEDBACK_SUBJECT for type FEEDBACK', () => {
      const result = faqService.getEmailSubjectByType(FEEDBACK);
      expect(result).toBe(FEEDBACK_SUBJECT);
    });

    it('should return SHARE_IDEA_SUBJECT for type SHARE_IDEA', () => {
      const result = faqService.getEmailSubjectByType(SHARE_IDEA);
      expect(result).toBe(SHARE_IDEA_SUBJECT);
    });

    it('should return null for an unknown type', () => {
      const result = faqService.getEmailSubjectByType('UNKNOWN_TYPE');
      expect(result).toBeNull();
    });
  });

  describe('FaqService - notifyNewCustomQuestion', () => {
    it('should notify support team with a new question without errors', async () => {
      const faq = {
        type: 'ASK_QUESTION',
        email: 'user@example.com',
        question: 'How to use this feature?',
        uid: 'unique-id',
      };

      // Mock getEmailSubjectByType to return a valid subject
      jest.spyOn(faqService, 'getEmailSubjectByType').mockReturnValue('A new feedback received');

      // Mock sendEmailWithTemplate to resolve successfully
      const mockSendEmailResponse: any = {
        MessageId: '12345',
        $response: {}, // Adding a mock $response to satisfy the type
      };
      jest.spyOn(awsService, 'sendEmailWithTemplate').mockResolvedValue(mockSendEmailResponse);

      // Mock logger methods
      const loggerInfoSpy = jest.spyOn(logService, 'info');
      const loggerErrorSpy = jest.spyOn(logService, 'error');

      // Call the method under test
      await faqService.notifyNewCustomQuestion(faq);

      // Assertions
      expect(faqService.getEmailSubjectByType).toHaveBeenCalledWith(faq.type);
      expect(awsService.sendEmailWithTemplate).toHaveBeenCalledWith(
        path.join(__dirname, '/shared/contactUs.hbs'),
        faq,
        '',
        'A new feedback received',
        'member-services@plnetwork.io',
        ['navaneeth@ideas2it.com'],
        []
      );
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `New faq request from ${faq.email} - ${faq.uid} notified to support team ref: 12345`
      );
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });
});
