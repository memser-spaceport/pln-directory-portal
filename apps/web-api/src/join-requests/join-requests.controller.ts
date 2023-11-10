import { Controller, Post, Body, UsePipes, InternalServerErrorException } from '@nestjs/common';
import { JoinRequestsService } from './join-request.service';
import { JoinRequestSchemaDto, JoinRequestResponseDto } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from 'nestjs-zod';

@Controller('/join-requests')
export class JoinRequestsController {
  constructor(private readonly joinRequestsService: JoinRequestsService) {}

  @Post('/')
  @UsePipes(ZodValidationPipe)
  async create(
    @Body() body: JoinRequestSchemaDto
  ): Promise<JoinRequestResponseDto> {
    if (await this.joinRequestsService.createJoinRequest(body)) {
      return { success: true };
    } else {
      throw new InternalServerErrorException();
    }
  }
}
