import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { HuskySearchModule } from '../husky/husky-search.module';
import { IntroRequestsModule } from '../intro-requests/intro-requests.module';
import { McpModule } from '../mcp/mcp.module';
import { TeamNewsModule } from '../team-news/team-news.module';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentProposalStore } from './labos-agent-proposals';

/**
 * LabOS in-app agent (LAB-3272). Reuses the AI search stream from HuskySearchModule and the MCP tool list
 * (McpToolCatalog) from McpModule, and the intro sender rule and target lookup from IntroRequestsModule (LAB-3300).
 */
@Module({
  imports: [HuskySearchModule, TeamNewsModule, McpModule, AccessControlV2Module, IntroRequestsModule],
  controllers: [LabosAgentController],
  providers: [LabosAgentService, LabosAgentAccessService, LabosAgentProposalStore],
})
export class LabosAgentModule {}
