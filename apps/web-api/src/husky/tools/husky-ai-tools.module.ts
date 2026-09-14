import { forwardRef, Module } from '@nestjs/common';
import { HuskyAiToolsService } from './husky-ai-tools.serivice';
import { IrlEventsTool } from './irl-events.tool';
import { MembersTool } from './members.tool';
import { TeamsTool } from './teams.tool';
import { ProjectsTool } from './projects.tool';
import { FocusAreasTool } from './focus-areas.tool';
import { AsksTool } from './asks.tool';
import { ForumTool } from './forum.tool';
import { InvestorsTool } from './investors.tool';
import { JobOpeningsTool } from './job-openings.tool';
import { NewsTool } from './news.tool';
import { DemoDayTool } from './demo-day.tool';
import { SearchModule } from '../../search/search.module';
import { RbacModule } from '../../rbac/rbac.module';
import { AccessControlV2Module } from '../../access-control-v2/access-control-v2.module';
import { JobOpeningsModule } from '../../job-openings/job-openings.module';
import { TeamNewsModule } from '../../team-news/team-news.module';
import { DemoDaysModule } from '../../demo-days/demo-days.module';

@Module({
  imports: [
    SearchModule,
    RbacModule,
    AccessControlV2Module,
    // These pull in MembersModule, which in turn imports HuskyModule (for
    // HuskyRevalidationService) — forwardRef breaks that require-time cycle,
    // matching how JobOpeningsModule/TeamNewsModule/DemoDaysModule already
    // forwardRef MembersModule.
    forwardRef(() => JobOpeningsModule),
    forwardRef(() => TeamNewsModule),
    forwardRef(() => DemoDaysModule),
  ],
  providers: [
    HuskyAiToolsService,
    IrlEventsTool,
    MembersTool,
    TeamsTool,
    ProjectsTool,
    FocusAreasTool,
    AsksTool,
    ForumTool,
    InvestorsTool,
    JobOpeningsTool,
    NewsTool,
    DemoDayTool,
  ],
  exports: [HuskyAiToolsService],
})
export class HuskyAiToolsModule {}
