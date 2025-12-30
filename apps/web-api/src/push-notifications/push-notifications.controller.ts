import { Controller, Get, Post, Patch, Delete, Param, Query, UseGuards, Req } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { MembersService } from '../members/members.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { NoCache } from '../decorators/no-cache.decorator';

/**
 * Controller for managing push notifications for the current user.
 * All endpoints require authentication.
 */
@Controller('v1/push-notifications')
@UseGuards(UserTokenValidation)
export class PushNotificationsController {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly membersService: MembersService
  ) {}

  /**
   * Get push notifications for the current user.
   *
   * GET /v1/push-notifications
   * Query params:
   *   - limit: number (default 50)
   *   - offset: number (default 0)
   *   - unreadOnly: boolean (default false)
   */
  @Get()
  @NoCache()
  async getNotifications(
    @Req() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unreadOnly') unreadOnly?: string
  ) {
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      return { notifications: [], total: 0, unreadCount: 0 };
    }

    return this.pushNotificationsService.getForUser(member.externalId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  /**
   * Get unread notification count for the current user.
   *
   * GET /v1/push-notifications/unread-count
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req) {
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      return { unreadCount: 0 };
    }

    const unreadCount = await this.pushNotificationsService.getUnreadCount(member.externalId);
    return { unreadCount };
  }

  /**
   * Mark a notification as read.
   *
   * PATCH /v1/push-notifications/:uid/read
   */
  @Patch(':uid/read')
  async markAsRead(@Req() req, @Param('uid') uid: string) {
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      return { success: false };
    }

    const notification = await this.pushNotificationsService.markAsRead(uid, member.externalId);
    return { success: !!notification, notification };
  }

  /**
   * Mark all notifications as read for the current user.
   *
   * POST /v1/push-notifications/mark-all-read
   */
  @Post('mark-all-read')
  async markAllAsRead(@Req() req) {
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      return { success: false };
    }

    return this.pushNotificationsService.markAllAsRead(member.externalId);
  }

  /**
   * Delete a notification.
   *
   * DELETE /v1/push-notifications/:uid
   */
  @Delete(':uid')
  async deleteNotification(@Req() req, @Param('uid') uid: string) {
    const member = await this.membersService.findMemberByEmail(req.userEmail);
    if (!member) {
      return { success: false };
    }

    const notification = await this.pushNotificationsService.delete(uid, member.externalId);
    return { success: !!notification };
  }
}
