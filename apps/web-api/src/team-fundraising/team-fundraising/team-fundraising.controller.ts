import {Body, Controller, Get, Param, Put, Req, UseGuards} from '@nestjs/common';
import {Request} from 'express';
import {UpsertTeamFundraisingDto} from '../dto/upsert-team-fundraising.dto';
import {TeamFundraisingService} from './team-fundraising.service';
import {PrismaService} from "../../shared/prisma.service";
import {UserTokenValidation} from "../../guards/user-token-validation.guard";

@Controller('v1/teams/:teamUid/fundraising-profile')
@UseGuards(UserTokenValidation)
export class TeamFundraisingController {
  constructor(private readonly service: TeamFundraisingService, private readonly prisma: PrismaService) {
  }

  private async memberUid(req: Request) {
    const email = (req as any)?.userEmail;
    const m = email ? await this.prisma.member.findUnique({where: {email}}) : null;
    if (!m) throw new Error('Unauthorized');
    return m.uid;
  }

  @Get()
  async getTeamProfile(@Req() req: Request, @Param('teamUid') teamUid: string) {
    const memberUid = await this.memberUid(req);
    return this.service.getForTeamAsMember(teamUid, memberUid);
  }

  @Put()
  async upsertTeamProfile(
    @Req() req: Request,
    @Param('teamUid') teamUid: string,
    @Body() body: UpsertTeamFundraisingDto,
  ) {
    const memberUid = await this.memberUid(req);
    return this.service.upsertForTeamAsMember(teamUid, memberUid, body);
  }
}
