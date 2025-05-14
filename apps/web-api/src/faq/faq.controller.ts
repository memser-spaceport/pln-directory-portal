import { Controller, Post, Body, UsePipes, InternalServerErrorException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FaqService } from './faq.service';
import {
  CustomQuestionSchema,
  CustomQuestionSchemaDto,
  CustomQuestionResponseDto,
  CustomQuestionResponseSchema,
} from 'libs/contracts/src/schema';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { RequestIp } from '../decorators/request.decorator';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';

@ApiTags('FAQ')
@Controller('/faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Post('/')
  @ApiBodyFromZod(CustomQuestionSchema)
  @ApiOkResponseFromZod(CustomQuestionResponseSchema)
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
