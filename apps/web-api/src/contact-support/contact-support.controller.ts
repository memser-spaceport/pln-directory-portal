import { Controller, Post, Body, UsePipes, InternalServerErrorException } from '@nestjs/common';
import { ContactSupportService } from './contact-support.service';
import { ContactSupportRequestDto, ContactSupportResponseDto } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from '@abitia/zod-dto';

@Controller('v1/contact-support')
export class ContactSupportController {
  constructor(private readonly contactSupportService: ContactSupportService) {}

  @Post()
  @UsePipes(ZodValidationPipe)
  async create(@Body() body: ContactSupportRequestDto): Promise<ContactSupportResponseDto> {
    const result = await this.contactSupportService.createSupportRequest(body);
    if (result) {
      return result;
    } else {
      throw new InternalServerErrorException();
    }
  }
}
