import { Injectable } from '@nestjs/common';
import { Member } from '@prisma/client';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { CacheService } from '../utils/cache/cache.service';
import { HuskyRevalidationService } from '../husky/husky-revalidation.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { ANALYTICS_EVENTS, UPDATE, CREATE } from '../utils/constants';

@Injectable()
export class MembersHooksService {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly cacheService: CacheService,
    private readonly huskyRevalidationService: HuskyRevalidationService,
    private readonly forestadminService: ForestAdminService,
  ) {}

  /**
   * Executes post-create actions such as resetting the cache and triggering Airtable sync.
   * Also tracks the member creation event with analytics.
   * This ensures that the system is up-to-date with the latest changes.
   */
  async postCreateActions(
    member: Member,
    requestorEmail: string
  ): Promise<void> {
    // Reset cache for members
    await this.cacheService.reset({ service: 'members' });

    // Trigger husky revalidation for members
    this.huskyRevalidationService.triggerHuskyRevalidation('members', member.uid, CREATE);

    // Trigger Airtable sync
    await this.forestadminService.triggerAirtableSync();

    // Track member creation event with analytics
    await this.analyticsService.trackEvent({
      name: ANALYTICS_EVENTS.MEMBER.MEMBER_CREATE,
      distinctId: requestorEmail,
      properties: {
        uid: member.uid,
        name: member.name,
        email: member.email,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Executes post-update actions such as resetting the cache and triggering Airtable sync.
   * Also tracks the member updation event with analytics.
   * This ensures that the system is up-to-date with the latest changes.
   */
  async postUpdateActions(
    member: Member,
    requestorEmail: string
  ): Promise<void> {
    // Reset cache for members
    await this.cacheService.reset({ service: 'members' });

    // Trigger husky revalidation for members
    this.huskyRevalidationService.triggerHuskyRevalidation('members', member.uid, UPDATE);

    // Trigger Airtable sync
    await this.forestadminService.triggerAirtableSync();

    // Track member update event with analytics
    await this.analyticsService.trackEvent({
      name: ANALYTICS_EVENTS.MEMBER.MEMBER_UPDATE,
      distinctId: requestorEmail,
      properties: {
        uid: member.uid,
        name: member.name,
        email: member.email,
        timestamp: new Date().toISOString()
      }
    });
  }
}
