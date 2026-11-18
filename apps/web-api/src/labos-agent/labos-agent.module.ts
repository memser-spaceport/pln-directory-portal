import { Module } from '@nestjs/common';
import { HuskySearchModule } from '../husky/husky-search.module';
import { TeamNewsModule } from '../team-news/team-news.module';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';
import { LabosAgentAccessService } from './labos-agent-access.service';

/** LabOS in-app agent (LAB-3272). Reuses the AI search stream from HuskySearchModule. */
@Module({
  imports: [HuskySearchModule, TeamNewsModule],
  controllers: [LabosAgentController],
  providers: [LabosAgentService, LabosAgentAccessService],
})
export class LabosAgentModule {}
