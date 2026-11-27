import { Controller, Header, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiMemberInvite } from 'libs/contracts/src/lib/contract-member-invite';
import { MemberInviteLink } from 'libs/contracts/src/schema/member-invite';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MemberInvitesService } from './member-invites.service';

const server = initNestServer(apiMemberInvite);

@Controller()
export class MemberInvitesController {
  constructor(private readonly memberInvites: MemberInvitesService) {}

  @Api(server.route.getMyInviteLink)
  @NoCache()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(UserTokenValidation)
  async getMyInviteLink(@Req() req: Request & { userEmail?: string }): Promise<MemberInviteLink> {
    return this.memberInvites.getMyInviteLink(req.userEmail);
  }
}
