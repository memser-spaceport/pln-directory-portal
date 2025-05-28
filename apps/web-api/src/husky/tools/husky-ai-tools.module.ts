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

@Module({
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
  ],
  exports: [HuskyAiToolsService],
})
export class HuskyAiToolsModule {}
