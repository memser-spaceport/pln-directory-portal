import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MemberCvImportsModule } from '../member-cv-imports/member-cv-imports.module';
import { MembersModule } from '../members/members.module';
import { TeamsModule } from '../teams/teams.module';
import { TeamHiringController } from './team-hiring.controller';
import { TeamHiringService } from './team-hiring.service';

/**
 * The Hiring tab: a team's own applicants and interested members, read and
 * triaged by its leads. Separate from `JobOpeningsModule` because the routes are
 * team-scoped and the audience is the hiring team, not the job seeker.
 */
@Module({
  imports: [SharedModule, MemberCvImportsModule, forwardRef(() => MembersModule), forwardRef(() => TeamsModule)],
  controllers: [TeamHiringController],
  providers: [TeamHiringService],
  exports: [TeamHiringService],
})
export class TeamHiringModule {}
