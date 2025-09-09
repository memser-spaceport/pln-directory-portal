import {Module} from '@nestjs/common';
import {TeamFundraisingController} from './team-fundraising/team-fundraising.controller';
import {AdminTeamFundraisingController} from "./admin-team-fundraising/admin-team-fundraising.controller";
import {TeamFundraisingService} from './team-fundraising/team-fundraising.service';
import {PrismaService} from "../shared/prisma.service";
import {JwtService} from "../utils/jwt/jwt.service";


@Module({
  controllers: [TeamFundraisingController, AdminTeamFundraisingController],
  providers: [TeamFundraisingService, PrismaService, JwtService],
  exports: [TeamFundraisingService],
})
export class TeamFundraisingModule {}
