import { Controller, ForbiddenException, Logger, Param, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFollow } from 'libs/contracts/src/lib/contract-follow';
import { FollowedTeamsQueryParams, TeamFollowersQueryParams } from 'libs/contracts/src/schema/follow';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MembersService } from '../members/members.service';
import { FollowsService } from './follows.service';
import { NoCache } from '../decorators/no-cache.decorator';

const server = initNestServer(apiFollow);

@Controller()
export class FollowsController {
  private readonly logger = new Logger(FollowsController.name);

  constructor(private readonly followsService: FollowsService, private readonly membersService: MembersService) {}

  @Api(server.route.followTeam)
  @UseGuards(UserTokenValidation)
  async followTeam(@Param('teamUid') teamUid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    return this.followsService.followTeam(member.uid, teamUid);
  }

  @Api(server.route.unfollowTeam)
  @UseGuards(UserTokenValidation)
  async unfollowTeam(@Param('teamUid') teamUid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    return this.followsService.unfollowTeam(member.uid, teamUid);
  }

  @Api(server.route.getFollowedTeams)
  @UseGuards(UserTokenValidation)
  async getFollowedTeams(@Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    const query = FollowedTeamsQueryParams.parse(req.query);
    return this.followsService.getFollowedTeams(member.uid, query);
  }

  @Api(server.route.getTeamFollowers)
  @NoCache()
  @UseGuards(UserTokenValidation)
  async getTeamFollowers(@Param('teamUid') teamUid: string, @Req() req: Request & { userEmail?: string }) {
    const member = await this.resolveMember(req);
    const query = TeamFollowersQueryParams.parse(req.query);

    // Followers of a team are visible only to that team's members and to
    // directory admins.
    const authorized =
      this.membersService.checkIfAdminUser(member) || (await this.followsService.isTeamMember(member.uid, teamUid));

    return this.followsService.getTeamFollowers(teamUid, query, authorized);
  }

  private async resolveMember(req: Request & { userEmail?: string }) {
    if (!req.userEmail) {
      throw new ForbiddenException('Authenticated member required');
    }
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      this.logger.warn(`Follow request from authenticated email ${req.userEmail} that is not a member`);
      throw new ForbiddenException('Member not found');
    }
    return member;
  }
}
