import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { NotificationServiceClient } from '../notifications/notification-service.client';

/**
 * Service-to-service endpoints for notification settings.
 * Used by external services like NodeBB forum.
 * Protected by ServiceAuthGuard (Basic auth with shared secret).
 */
@ApiTags('NotificationSettings - Service')
@UseGuards(ServiceAuthGuard)
@Controller('v1/service/notification/settings')
export class NotificationSettingsServiceController {
  constructor(private notificationServiceClient: NotificationServiceClient) {}

  /**
   * Bulk check subscription status for multiple members.
   * Returns list of memberUids that are subscribed (settings.enabled === true).
   *
   * @example POST /v1/service/notification/settings/subscribed
   * Body: { memberUids: ["uid1", "uid2"], type: "POST_COMMENT", contextId: "123" }
   * Response: { subscribedMemberUids: ["uid1"] }
   */
  @Post('subscribed')
  @NoCache()
  async findSubscribedMembers(@Body() body: { memberUids: string[]; type: string; contextId: string }) {
    const { memberUids, type, contextId } = body;

    if (!memberUids || memberUids.length === 0) {
      return { subscribedMemberUids: [] };
    }

    // Fetch all items for this type and contextId in one call
    const items = await this.notificationServiceClient.findItems(type, contextId);

    if (!items || items.length === 0) {
      return { subscribedMemberUids: [] };
    }

    // Filter to only requested memberUids that are subscribed
    const subscribedSet = new Set(
      items.filter((item: any) => item?.settings?.enabled === true).map((item: any) => item.memberUid)
    );

    const subscribedMemberUids = memberUids.filter((uid) => subscribedSet.has(uid));

    return { subscribedMemberUids };
  }
}
