import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { HuskyModule } from '../husky/husky.module';
import { HuskySearchModule } from '../husky/husky-search.module';
import { IntroRequestsModule } from '../intro-requests/intro-requests.module';
import { JobOpeningsModule } from '../job-openings/job-openings.module';
import { McpModule } from '../mcp/mcp.module';
import { TeamNewsModule } from '../team-news/team-news.module';
import { TeamsModule } from '../teams/teams.module';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentProposalStore } from './labos-agent-proposals';
import { LabosAgentThreadsController } from './labos-agent-threads.controller';
import { LabosAgentThreadsService } from './labos-agent-threads.service';
import { LabosAgentThreadStore } from './labos-agent-threads.store';

/**
 * LabOS in-app agent (LAB-3272). Reuses the AI search stream from HuskySearchModule and the MCP tool list
 * (McpToolCatalog) from McpModule, and the intro sender rule and target lookup from IntroRequestsModule (LAB-3300).
 * The page rules of the team and job pages come from TeamsModule and JobOpeningsModule (LAB-3302). The shared chat
 * history (LAB-3457) uses the AI search MongoDB collections and cache from HuskyModule.
 */
@Module({
  imports: [
    HuskyModule,
    HuskySearchModule,
    TeamNewsModule,
    McpModule,
    AccessControlV2Module,
    IntroRequestsModule,
    TeamsModule,
    JobOpeningsModule,
  ],
  controllers: [LabosAgentController, LabosAgentThreadsController],
  providers: [
    LabosAgentService,
    LabosAgentAccessService,
    LabosAgentProposalStore,
    LabosAgentThreadStore,
    LabosAgentThreadsService,
  ],
})
export class LabosAgentModule {}
