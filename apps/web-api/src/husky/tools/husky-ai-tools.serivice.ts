import { Injectable, OnModuleInit } from '@nestjs/common';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { SearchService } from '../../search/search.service';
import { CoreTool } from 'ai';
import { IrlEventsTool } from './irl-events.tool';
import { MembersTool } from './members.tool';
import { TeamsTool } from './teams.tool';
import { ProjectsTool } from './projects.tool';
import { FocusAreasTool } from './focus-areas.tool';
import { AsksTool } from './asks.tool';
import { NonDirectoryDocsTool } from './non-directory-docs.tool';
import { ForumTool } from './forum.tool';

@Injectable()
export class HuskyAiToolsService implements OnModuleInit {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private searchService: SearchService,
    private irlEventsTool: IrlEventsTool,
    private membersTool: MembersTool,
    private teamsTool: TeamsTool,
    private projectsTool: ProjectsTool,
    private focusAreasTool: FocusAreasTool,
    private asksTool: AsksTool,
    private nonDirectoryDocsTool: NonDirectoryDocsTool,
    private forumTool: ForumTool
  ) {}

  async onModuleInit() {
    await this.irlEventsTool.initialize();
  }

  public getTools(isLoggedIn: boolean): Record<string, CoreTool> {
    return {
      getIrlEvents: this.irlEventsTool.getTool(),
      getMembers: this.membersTool.getTool(isLoggedIn),
      getTeams: this.teamsTool.getTool(),
      getProjects: this.projectsTool.getTool(),
      getFocusAreas: this.focusAreasTool.getTool(),
      getAsks: this.asksTool.getTool(),
      getNonDirectoryDocs: this.nonDirectoryDocsTool.getTool(),
      getForumPosts: this.forumTool.getTool(isLoggedIn),
    };
  }
}
