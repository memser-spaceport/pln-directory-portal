import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { HuskyDataIngestionService } from './husky-data-ingestion.service';
import { LogService } from './log.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private static warned = false;
  constructor(
    private ingestionService: HuskyDataIngestionService,
    private readonly logger: LogService,
  ) {
    super();
  }
  async onModuleInit() {
    await this.$connect();
    // Setting up Prisma Middleware for handling Team updates
    this.$use(async (params, next) => {
      const result = await next(params);
      if (params.model === 'Team' && params.action === 'update') {
        await this.createTeamFocusAreaVersionHistory(params);
      }

      // DB event tracking
      try {
        if (process.env.ENABLE_DB_EVENT_TRACKING?.toLowerCase() === 'true') {
          await this.emitCUDEvents(params, result);
        } else if (!PrismaService.warned) {
          PrismaService.warned = true;
          this.logger.info('Skipping database event tracking. Set ENABLE_DB_EVENT_TRACKING=true to enable.');
        }
      } catch (error) {
        // swallow to not block db operation
        this.logger.error(
          'Error occurred in emitting CUD events to Queue',
          (error as any)?.stack,
          PrismaService.name,
        );
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

        // Skip if teamUid is not available (shouldn't happen for updates, but safety check)
        if (!teamUid) {
          return;
        }

        const newFocusAreasUids = [
          ...new Set(team.teamFocusAreas?.createMany?.data?.map((area) => area.focusAreaUid) || []),
        ];

        // Skip if no focus areas are being updated
        if (newFocusAreasUids.length === 0 && !team.teamFocusAreas?.deleteMany) {
          return;
        }

        const newFocusAreas = await this.findFocusAreas(newFocusAreasUids);
        const existingFocusAreas = await this.findTeamFocusAreasRecentVersion(teamUid);
        const existingFocusAreasUids: any = existingFocusAreas.map((area) => area.focusAreaUid);

        // Skip if no lastModifier is provided
        if (!team?.lastModifier?.connect?.uid) {
          return;
        }

        const member: any = await this.member.findFirstOrThrow({ where: { uid: team?.lastModifier?.connect?.uid } });
        if (
          existingFocusAreas.length === 1 &&
          existingFocusAreas[0].focusAreaUid === null &&
          newFocusAreasUids.length === 0
        ) {
          return;
        } else if (existingFocusAreas.length === 0 && newFocusAreasUids.length === 0) {
          focusAreaVersion.push({
            teamUid,
            teamName: team.name,
            focusAreaUid: null,
            focusAreaTitle: null,
            version: 1,
            modifiedBy: member.uid,
            username: member.name,
          });
        } else if (existingFocusAreas.length > 0 && newFocusAreasUids.length === 0) {
          focusAreaVersion.push({
            teamUid,
            teamName: team.name,
            focusAreaUid: null,
            focusAreaTitle: null,
            version: existingFocusAreas[0].version + 1,
            modifiedBy: member.uid,
            username: member.name,
          });
        } else if (existingFocusAreas.length > 0) {
          let isFocusAreaUpdated = false;
          const recentVersion = existingFocusAreas[0]?.version;
          newFocusAreasUids.forEach((focusAreaUid) => {
            if (!existingFocusAreasUids.includes(focusAreaUid)) {
              isFocusAreaUpdated = true;
            }
          });
          if (isFocusAreaUpdated || existingFocusAreas.length != newFocusAreasUids.length) {
            newFocusAreasUids.forEach((areaUid, index: number) => {
              focusAreaVersion.push({
                teamUid,
                teamName: team.name,
                focusAreaUid: areaUid,
                focusAreaTitle: newFocusAreas[index]?.title,
                version: recentVersion + 1,
                modifiedBy: member.uid,
                username: member.name,
              });
            });
          }
        } else {
          newFocusAreasUids.forEach((areaUid, index: number) => {
            focusAreaVersion.push({
              teamUid,
              teamName: team.name,
              focusAreaUid: areaUid,
              focusAreaTitle: newFocusAreas[index].title,
              version: 1,
              modifiedBy: member.uid,
              username: member.name,
            });
          });
        }

        // Only create version history if there are changes to log
        if (focusAreaVersion.length > 0) {
          await this.teamFocusAreaVersionHistory.createMany({ data: focusAreaVersion });
        }
      } catch (error) {
        console.error(
          `Error occured while logging focus area version history to the team ${params.args?.where?.uid}`,
          error
        );
      }
    });
  }

  async findFocusAreas(uids) {
    return await this.focusArea.findMany({
      where: {
        uid: {
          in: uids,
        },
      },
    });
  }

  async findTeamFocusAreasRecentVersion(teamUid) {
    const result = await this.teamFocusAreaVersionHistory.findMany({
      where: {
        teamUid,
      },
      orderBy: [
        {
          version: 'desc',
        },
      ],
    });

    if (result.length > 0) {
      const recentVersion = result[0]?.version;
      return result.filter((focusArea) => focusArea.version === recentVersion);
    }
    return [];
  }

  /**
   * Emits Create, Update, Delete (CUD) events to DynamoDB ingestion table
   * Tracks changes for specified entities and writes them to the ingestion table
   *
   * @param params - Prisma middleware parameters containing model and action information
   * @param result - The result of the database operation containing the uid
   * @private
   */
  private async emitCUDEvents(params, result) {
    const models = process.env.TRACKED_DB_ENTITIES
      ? process.env.TRACKED_DB_ENTITIES.split(',').map(model => model.trim())
      : ['Member', 'Team', 'PLEvent', 'Project'];
    const actions = ['create', 'update', 'delete'];
    const { action, model } = params;
    const { uid } = result;

    // Validate that we have all required data and that the entity is tracked
    if (!(model && models.includes(model) && action && actions.includes(action) && uid)) {
      return;
    }

    // Write to DynamoDB ingestion table
    await this.ingestionService.ingestRecord({
      entity: model,
      action,
      data: {
        uid
      },
      options: {
        timestamp: new Date().toISOString()
      }
    });
  }
}
