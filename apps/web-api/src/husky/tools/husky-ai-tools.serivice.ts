import { Injectable, OnModuleInit } from '@nestjs/common';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { CoreTool } from 'ai';
import { IrlEventsTool } from './irl-events.tool';
import { MembersTool } from './members.tool';
import { TeamsTool } from './teams.tool';
import { ProjectsTool } from './projects.tool';
import { FocusAreasTool } from './focus-areas.tool';
import { AsksTool } from './asks.tool';
import { NonDirectoryDocsTool } from './non-directory-docs.tool';

@Injectable()
export class HuskyAiToolsService implements OnModuleInit {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private irlEventsTool: IrlEventsTool,
    private membersTool: MembersTool,
    private teamsTool: TeamsTool,
    private projectsTool: ProjectsTool,
    private focusAreasTool: FocusAreasTool,
    private asksTool: AsksTool,
    private nonDirectoryDocsTool: NonDirectoryDocsTool
  ) {}

  async onModuleInit() {
    console.log('to initialize husky tools.......');
    
    // Wait for PrismaService to be ready
    let retries = 0;
    const maxRetries = 10;
    
    while (retries < maxRetries) {
      try {
        await this.prisma.$connect();
        break;
      } catch (error) {
        retries++;
        console.log(`Waiting for PrismaService to be ready... (${retries}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    
    await this.irlEventsTool.initialize();
    console.log('after husky tools initiliazed........');
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
    };
  }
}
