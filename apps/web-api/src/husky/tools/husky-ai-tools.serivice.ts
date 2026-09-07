import { Injectable, OnModuleInit } from '@nestjs/common';
import { CoreTool } from 'ai';
import { LogService } from '../../shared/log.service';
import { IrlEventsTool } from './irl-events.tool';
import { MembersTool } from './members.tool';
import { TeamsTool } from './teams.tool';
import { ProjectsTool } from './projects.tool';
import { FocusAreasTool } from './focus-areas.tool';
import { AsksTool } from './asks.tool';
import { ForumTool } from './forum.tool';

/**
 * Directory database tools exposed to the Husky search model. Every tool reads
 * from PostgreSQL (or the forum search index); there is no vector store.
 */
@Injectable()
export class HuskyAiToolsService implements OnModuleInit {
  constructor(
    private logger: LogService,
    private irlEventsTool: IrlEventsTool,
    private membersTool: MembersTool,
    private teamsTool: TeamsTool,
    private projectsTool: ProjectsTool,
    private focusAreasTool: FocusAreasTool,
    private asksTool: AsksTool,
    private forumTool: ForumTool
  ) {}

  async onModuleInit() {
    await this.irlEventsTool.initialize();
  }

  public getTools(isLoggedIn: boolean): Record<string, CoreTool> {
    const tools: Record<string, CoreTool> = {
      getIrlEvents: this.irlEventsTool.getTool(),
      getMembers: this.membersTool.getTool(isLoggedIn),
      getTeams: this.teamsTool.getTool(),
      getProjects: this.projectsTool.getTool(),
      getFocusAreas: this.focusAreasTool.getTool(),
      getAsks: this.asksTool.getTool(),
      getForumPosts: this.forumTool.getTool(isLoggedIn),
    };
    return Object.fromEntries(Object.entries(tools).map(([name, tool]) => [name, this.withFailureFallback(name, tool)]));
  }

  /**
   * A tool that throws would abort the whole answer stream. Instead the failure is
   * logged and reported to the model as a tool result, so it can still answer from
   * the other tools or say that the data is unavailable.
   */
  private withFailureFallback(name: string, tool: CoreTool): CoreTool {
    const execute = tool.execute;
    if (!execute) {
      return tool;
    }
    return {
      ...tool,
      execute: async (args, options) => {
        try {
          return await execute(args, options);
        } catch (error) {
          this.logger.error(`Husky tool ${name} failed for args ${JSON.stringify(args)}: ${error?.message ?? error}`);
          return `The ${name} tool is currently unavailable, so no data could be retrieved from it.`;
        }
      },
    } as CoreTool;
  }
}
