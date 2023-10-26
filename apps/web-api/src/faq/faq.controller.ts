import { Controller, Post, Body, UsePipes, InternalServerErrorException } from '@nestjs/common';
import { FaqService } from './faq.service';
import { CustomQuestionSchemaDto, CustomQuestionResponseDto } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequestIp } from '../decorators/request.decorator';

@Controller('/faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Post('/')
  @UsePipes(ZodValidationPipe)
  async create(
    @Body() body: CustomQuestionSchemaDto,
    @RequestIp() requestIp: string
  ): Promise<CustomQuestionResponseDto> {
    if (await this.faqService.addQuestion(body, requestIp)) {
      return { success: true };
    } else {
      throw new InternalServerErrorException();
    }
  }
}
