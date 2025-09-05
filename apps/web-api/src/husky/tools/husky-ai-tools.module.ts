import { Module } from '@nestjs/common';
import { HuskyAiToolsService } from './husky-ai-tools.serivice';
import { IrlEventsTool } from './irl-events.tool';
import { MembersTool } from './members.tool';
import { TeamsTool } from './teams.tool';
import { ProjectsTool } from './projects.tool';
import { FocusAreasTool } from './focus-areas.tool';
import { AsksTool } from './asks.tool';
import { NonDirectoryDocsTool } from './non-directory-docs.tool';
import { QdrantVectorDbService } from '../db/qdrant-vector-db.service';
import { ForumTool } from './forum.tool';
import { SearchModule } from '../../search/search.module';

@Module({
  imports: [SearchModule],
  providers: [
    HuskyAiToolsService,
    IrlEventsTool,
    MembersTool,
    TeamsTool,
    ProjectsTool,
    FocusAreasTool,
    AsksTool,
    NonDirectoryDocsTool,
    QdrantVectorDbService,
    ForumTool,
  ],
  exports: [HuskyAiToolsService],
})
export class HuskyAiToolsModule {}
