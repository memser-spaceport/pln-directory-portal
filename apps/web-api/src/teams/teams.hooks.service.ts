import { Injectable } from '@nestjs/common';
import { Team } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { CacheService } from '../utils/cache/cache.service';
import { HuskyRevalidationService } from '../husky/husky-revalidation.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { ANALYTICS_EVENTS, UPDATE, CREATE } from '../utils/constants';

@Injectable()
export class TeamsHooksService {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly cacheService: CacheService,
    private readonly huskyRevalidationService: HuskyRevalidationService,
    private readonly forestadminService: ForestAdminService,
  ) {}

  /**
   * Executes post-create actions such as triggering husky revalidation.
   * Also tracks the team creation event with analytics.
   * This ensures that the system is up-to-date with the latest changes.
   */
  async postCreateActions(
    team: Team,
    requestorEmail: string
  ): Promise<void> {
    await this.cacheService.reset({ service: 'teams' });
    // Trigger husky revalidation for teams
    this.huskyRevalidationService.triggerHuskyRevalidation('teams', team.uid, CREATE);

    // Trigger Airtable sync
    await this.forestadminService.triggerAirtableSync();
    
    // Track team creation event with analytics
    await this.analyticsService.trackEvent({
      name: ANALYTICS_EVENTS.TEAM.TEAM_CREATE,
      distinctId: requestorEmail,
      properties: {
        uid: team.uid,
        name: team.name,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Executes post-update actions such as resetting the cache and triggering Airtable sync.
   * Also tracks the team update event with analytics.
   * This ensures that the system is up-to-date with the latest changes.
   */
  async postUpdateActions(team: Team, requestorEmail: string): Promise<void> {
    // Reset cache for teams
    await this.cacheService.reset({ service: 'teams' });
    
    // Trigger husky revalidation for teams
    this.huskyRevalidationService.triggerHuskyRevalidation('teams', team.uid, UPDATE);
    
    // Trigger Airtable sync
    await this.forestadminService.triggerAirtableSync();
    
    // Track team update event with analytics
    await this.analyticsService.trackEvent({
      name: ANALYTICS_EVENTS.TEAM.TEAM_UPDATE,
      distinctId: requestorEmail,
      properties: {
        uid: team.uid,
        name: team.name,
        timestamp: new Date().toISOString()
      }
    });
  }
} 