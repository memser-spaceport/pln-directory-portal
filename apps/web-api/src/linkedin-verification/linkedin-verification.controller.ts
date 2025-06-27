import { Controller, Get, Post, Query, Body, Res, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { Response, Request, request } from 'express';
import { LinkedInVerificationService } from './linkedin-verification.service';
import { LinkedInAuthUrlRequestDto, LinkedInCallbackRequestDto } from 'libs/contracts/src/schema/linkedin-verification';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { MembersService } from '../members/members.service';

@Controller('v1/linkedin-verification')
export class LinkedInVerificationController {
  constructor(
    private readonly linkedinVerificationService: LinkedInVerificationService,
    private readonly membersService: MembersService
  ) {}

  @Post('auth-url')
  @UseGuards(UserAccessTokenValidateGuard)
  async getLinkedInAuthUrl(@Body() request: LinkedInAuthUrlRequestDto, @Req() req: Request) {
    const requestor = await this.membersService.findMemberByEmail(req['userEmail']);

    if (requestor.uid !== request.memberUid) {
      throw new ForbiddenException('You are not authorized to access this resource');
    }

    return await this.linkedinVerificationService.getLinkedInAuthUrl(request);
  }

  @Get('callback')
  async linkedinCallback(@Query() query: LinkedInCallbackRequestDto, @Res() res: Response) {
    const result = await this.linkedinVerificationService.handleLinkedInCallback(query);
    res.redirect(result.redirectUrl);
  }

  @Get('status/:memberUid')
  @UseGuards(UserAccessTokenValidateGuard)
  async getVerificationStatus(@Param('memberUid') memberUid: string, @Req() req: Request) {
    const requestor = await this.membersService.findMemberByEmail(req['userEmail']);

    if (requestor.uid !== memberUid) {
      throw new ForbiddenException('You are not authorized to access this resource');
    }

    return await this.linkedinVerificationService.getLinkedInVerificationStatus(memberUid);
  }
}
