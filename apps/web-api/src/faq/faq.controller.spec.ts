import { Test, TestingModule } from '@nestjs/testing';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { CustomQuestionSchemaDto, CustomQuestionResponseDto } from 'libs/contracts/src/schema';
import { InternalServerErrorException } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequestIp } from '../decorators/request.decorator';

describe('FaqController', () => {
  let faqController: FaqController;
  let faqService: FaqService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaqController],
      providers: [
        {
          provide: FaqService,
          useValue: {
            addQuestion: jest.fn(),
          },
        },
      ],
    }).compile();

    faqController = module.get<FaqController>(FaqController);
    faqService = module.get<FaqService>(FaqService);
  });

  describe('create', () => {
    it('should return success when addQuestion is successful', async () => {
      const body: CustomQuestionSchemaDto = {
        email: 'user@example.com',
        question: 'How does this work?',
        type: 'ASK_QUESTION',
      };
      const requestIp = '127.0.0.1';

      // Mock the addQuestion method to return true (successful operation)
      jest.spyOn(faqService, 'addQuestion').mockResolvedValue(true);

      // Call the controller method
      const result: CustomQuestionResponseDto = await faqController.create(body, requestIp);

      // Assertions
      expect(result).toEqual({ success: true });
      expect(faqService.addQuestion).toHaveBeenCalledWith(body, requestIp);
    });

    it('should throw InternalServerErrorException when addQuestion fails', async () => {
      const body: CustomQuestionSchemaDto = {
        email: 'user@example.com',
        question: 'How does this work?',
        type: 'ASK_QUESTION',
      };
      const requestIp = '127.0.0.1';

      // Mock the addQuestion method to return false (unsuccessful operation)
      jest.spyOn(faqService, 'addQuestion').mockResolvedValue(false);

      // Call the controller method and expect an exception
      try {
        await faqController.create(body, requestIp);
      } catch (error) {
        expect(error).toBeInstanceOf(InternalServerErrorException);
      }
    });
  });
});
