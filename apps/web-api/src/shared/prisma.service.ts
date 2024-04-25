import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    // Setting up Prisma Middleware for handling Team updates
    this.$use(async (params, next) => {
      const result = await next(params);
      if (params.model === 'Team' && params.action === 'update') {
        await this.createTeamFocusAreaVersionHistory(params);
      }
      return result;
    });
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }

  async createTeamFocusAreaVersionHistory(params) {
    setImmediate(async () => {
      try {
        const focusAreaVersion: any = [];
        const team = params.args?.data;
        const teamUid = params.args?.where?.uid;
        const newFocusAreasUids = [...new Set(team.teamFocusAreas?.createMany?.data?.map(area => area.focusAreaUid)||[])];
        const newFocusAreas = await this.findFocusAreas(newFocusAreasUids);
        const existingFocusAreas = await this.findTeamFocusAreasRecentVersion(teamUid);
        const existingFocusAreasUids:any = existingFocusAreas.map(area=> area.focusAreaUid);
        const member:any = await this.member.findFirstOrThrow({ where: { uid: team?.lastModifier?.connect?.uid }});
        if (
          existingFocusAreas.length === 1 &&
          existingFocusAreas[0].focusAreaUid === null && 
          newFocusAreasUids.length === 0
        ) {
          return ;
        } else if(existingFocusAreas.length === 0 && newFocusAreasUids.length === 0) {
          focusAreaVersion.push(
            {
              teamUid,
              teamName: team.name,
              focusAreaUid: null,
              focusAreaTitle: null,
              version: 1,
              modifiedBy: member.uid,
              username: member.name
            }
          );  
        } else if (existingFocusAreas.length > 0 && newFocusAreasUids.length === 0) {
          focusAreaVersion.push(
            {
              teamUid, 
              teamName: team.name, 
              focusAreaUid: null,
              focusAreaTitle: null,
              version: existingFocusAreas[0].version + 1,
              modifiedBy: member.uid,
              username: member.name
            }
          );  
        } else if (existingFocusAreas.length > 0) {
          let isFocusAreaUpdated = false;
          let recentVersion = existingFocusAreas[0]?.version;
          newFocusAreasUids.forEach((focusAreaUid) => {
            if (!existingFocusAreasUids.includes(focusAreaUid)) {
              isFocusAreaUpdated = true;
            }
          });
          if (isFocusAreaUpdated || existingFocusAreas.length != newFocusAreasUids.length) {
            newFocusAreasUids.forEach((areaUid, index:number) => {
              focusAreaVersion.push(
                {
                  teamUid,
                  teamName: team.name,
                  focusAreaUid: areaUid,
                  focusAreaTitle: newFocusAreas[index]?.title,
                  version: recentVersion + 1,
                  modifiedBy: member.uid,
                  username: member.name
                }
              );  
            });
          }
        } else {
          newFocusAreasUids.forEach((areaUid, index:number)=>{
            focusAreaVersion.push(
              {
                teamUid,
                teamName: team.name,
                focusAreaUid: areaUid,
                focusAreaTitle: newFocusAreas[index].title,
                version: 1,
                modifiedBy: member.uid,
                username: member.name
              }
            );  
          });
        }
        await this.teamFocusAreaVersionHistory.createMany({ data: focusAreaVersion })
      } catch (error) {
        console.error(`Error occured while logging focus area version history to the team ${params.args?.where?.uid}`, error);
      }
    });
  }

  async findFocusAreas(uids) {
    return await this.focusArea.findMany({
      where: {
        uid: {
          in: uids
        }
      }
    });
  }

  async findTeamFocusAreasRecentVersion(teamUid) {
    const result = await this.teamFocusAreaVersionHistory.findMany({
      where: {
        teamUid
      },
      orderBy: [
        {
          version: "desc"
        }
      ]
    });
  
    if (result.length > 0) {
      const recentVersion = result[0]?.version;
      return result.filter(focusArea=> focusArea.version === recentVersion); 
    }
    return [];
  }
}
