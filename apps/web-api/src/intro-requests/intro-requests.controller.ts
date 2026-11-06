import { Body, Controller, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { CreateIntroRequestDto, CreateIntroRequestResponseDto } from 'libs/contracts/src/schema';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { IntroRequestsService } from './intro-requests.service';

@Controller('v1/intro-requests')
export class IntroRequestsController {
  constructor(private readonly introRequestsService: IntroRequestsService) {}

  @Post()
  @UseGuards(UserTokenValidation)
  @UsePipes(ZodValidationPipe)
  create(
    @Req() request: { userEmail?: string },
    @Body() body: CreateIntroRequestDto
  ): Promise<CreateIntroRequestResponseDto> {
    return this.introRequestsService.create(request.userEmail, body);
  }
}
