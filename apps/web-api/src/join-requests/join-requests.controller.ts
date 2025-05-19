import { Controller, Post, Body, UsePipes, InternalServerErrorException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JoinRequestsService } from './join-request.service';
import { JoinRequestSchemaDto, JoinRequestResponseDto, JoinRequestSchema } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';

@ApiTags('Join Requests')
@Controller('/join-requests')
export class JoinRequestsController {
  constructor(private readonly joinRequestsService: JoinRequestsService) {}

  @Post('/')
  @UsePipes(ZodValidationPipe)
  @ApiBodyFromZod(JoinRequestSchema)
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
