import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import { MemberFeedbacksService } from '../member-feedbacks/member-feedbacks.service';
import { Prisma } from '@prisma/client';
import { MemberFollowUpStatus, MemberFollowUpType, MemberFeedbackResponseType } from 'libs/contracts/src/schema';
import {
  InteractionFailureReasons,
  EMAIL_TEMPLATES,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_ENTITY_TYPES,
  OFFICE_HOURS_ACTIONS,
} from '../utils/constants';
import axios from 'axios';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { MembersService } from '../members/members.service';

@Injectable()
export class OfficeHoursService {
  private delayedFollowUps = [MemberFollowUpType.Enum.MEETING_SCHEDULED, MemberFollowUpType.Enum.MEETING_YET_TO_HAPPEN];

  private isBatchRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LogService,
    private readonly followUpService: MemberFollowUpsService,
    private readonly feedbackService: MemberFeedbacksService,
    private readonly notificationClient: NotificationServiceClient,
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService
  ) {}

  async createInteraction(interaction: Prisma.MemberInteractionUncheckedCreateInput, loggedInMember) {
    try {
      return this.prisma.$transaction(async (tx) => {
        const result = await tx.memberInteraction.create({
          data: {
            ...interaction,
            sourceMemberUid: loggedInMember?.uid,
          },
        });
        if (result?.hasFollowUp) {
          await this.createInteractionFollowUp(result, loggedInMember, MemberFollowUpType.Enum.MEETING_INITIATED, tx);
          await this.createInteractionFollowUp(result, loggedInMember, MemberFollowUpType.Enum.MEETING_SCHEDULED, tx);
        }
        return result;
      });
    } catch (exception) {
      this.handleErrors(exception);
    }
  }

  async findInteractions(queryOptions: Prisma.MemberInteractionFindManyArgs) {
    try {
      return await this.prisma.memberInteraction.findMany({
        ...queryOptions,
      });
    } catch (exception) {
      this.handleErrors(exception);
    }
  }

  async createInteractionFollowUp(interaction, loggedInMember, type, tx?, scheduledAt?) {
    const followUp: any = {
      status: MemberFollowUpStatus.Enum.PENDING,
      interactionUid: interaction?.uid,
      createdBy: loggedInMember?.uid,
      type,
      data: {
        ...interaction.data,
      },
      isDelayed: this.delayedFollowUps.includes(type),
    };
    if (scheduledAt != null) {
      followUp.createdAt = new Date(scheduledAt);
    }
    return await this.followUpService.createFollowUp(followUp, interaction, tx);
  }

  async createInteractionFeedback(feedback, member, followUp) {
    feedback.comments = feedback.comments?.map((comment) => InteractionFailureReasons[comment] || comment) || [];
    return await this.prisma.$transaction(async (tx) => {
      if (
        followUp.type === MemberFollowUpType.Enum.MEETING_INITIATED &&
        feedback.response === MemberFeedbackResponseType.Enum.NEGATIVE
      ) {
        const delayedFollowUps = await this.followUpService.getFollowUps(
          {
            where: {
              interactionUid: followUp.interactionUid,
              type: MemberFollowUpType.Enum.MEETING_SCHEDULED,
            },
          },
          tx
        );
        if (delayedFollowUps?.length) {
          await this.followUpService.updateFollowUpStatusByUid(
            delayedFollowUps[0]?.uid,
            MemberFollowUpStatus.Enum.COMPLETED,
            tx
          );
        }
      }
      if (feedback.response === MemberFeedbackResponseType.Enum.NEGATIVE && feedback.comments?.includes('IFR0004')) {
        await this.createInteractionFollowUp(
          followUp.interaction,
          member,
          MemberFollowUpType.Enum.MEETING_YET_TO_HAPPEN,
          tx
        );
      } else if (
        feedback.response === MemberFeedbackResponseType.Enum.NEGATIVE &&
        feedback.comments?.includes('IFR0005')
      ) {
        await this.createInteractionFollowUp(
          followUp.interaction,
          member,
          MemberFollowUpType.Enum.MEETING_RESCHEDULED,
          tx,
          feedback?.data?.scheduledAt
        );
      }
      return await this.feedbackService.createFeedback(feedback, member, followUp, tx);
    });
  }

  async closeMemberInteractionFollowUpByID(followUpUid) {
    try {
      return await this.followUpService.updateFollowUpStatusByUid(followUpUid, MemberFollowUpStatus.Enum.CLOSED);
    } catch (error) {
      this.handleErrors(error, followUpUid);
    }
  }

  async checkLink(link: string): Promise<'OK' | 'BROKEN' | 'NOT_FOUND'> {
    if (!link) return 'NOT_FOUND';

    const normalizedLink = this.normalizeUrl(link);

    try {
      const response = await axios.get(normalizedLink, { maxRedirects: 5, timeout: 8000, validateStatus: () => true });
      const status = response.status;
      return status >= 200 && status < 400 ? 'OK' : 'BROKEN';
    } catch (e) {
      return 'BROKEN';
    }
  }

  async checkProvidedLink(link: string) {
    const status = await this.checkLink(link);
    return { status };
  }

  async checkAllLinksBatch(): Promise<{ started: boolean; message?: string }> {
    if (this.isBatchRunning) {
      return { started: false, message: 'Already running' };
    }
    this.isBatchRunning = true;
    try {
      const batchSize = 10;
      let skip = 0;
      while (true) {
        const members = await this.prisma.member.findMany({
          where: { officeHours: { not: null } },
          select: { uid: true, officeHours: true },
          take: batchSize,
          skip,
        });
        if (!members.length) break;
        const updates = await Promise.allSettled(
          members.map(async (m) => {
            const status = await this.checkLink(m.officeHours as string);
            await this.prisma.member.update({ where: { uid: m.uid }, data: { ohStatus: status } });
          })
        );
        this.logger.info(
          `Processed OH links batch: skip=${skip}, succeeded=${updates.filter((u) => u.status === 'fulfilled').length}`
        );
        skip += batchSize;
      }
      return { started: true };
    } catch (e) {
      this.logger.error(e);
      return { started: true, message: 'Completed with errors' };
    } finally {
      this.isBatchRunning = false;
    }
  }

  // --- New: Report broken OH booking attempt and notify target ---
  async reportBrokenOHAttempt(targetMemberUid: string, requester) {
    const target = await this.membersService.findOne(targetMemberUid);
    const requesterMember = requester; // requester is already member object from token

    // Check if the same requester already reported this target within the last 4 hours
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 4);

    const existingReport = await this.prisma.memberInteraction.findFirst({
      where: {
        type: 'BROKEN_OH_BOOKING_ATTEMPT',
        targetMemberUid,
        sourceMemberUid: requesterMember.uid,
        createdAt: { gte: oneHourAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    // If a report already exists within the last hour, check if it was fixed after the report
    if (existingReport) {
      // Check if there was a BROKEN_OH_FIXED_NOTIFICATION_SENT after the existing report
      const fixedAfterReport = await this.prisma.memberInteraction.findFirst({
        where: {
          type: 'BROKEN_OH_FIXED_NOTIFICATION_SENT',
          targetMemberUid,
          sourceMemberUid: requesterMember.uid,
          createdAt: { gte: existingReport.createdAt },
        },
      });

      // If no fix notification was sent after the existing report, don't create a new report
      if (!fixedAfterReport) {
        return { success: true, message: 'Report already exists within the last hour' };
      }
      // If there was a fix notification, allow creating a new report
    }

    await this.prisma.memberInteraction.create({
      data: {
        type: 'BROKEN_OH_BOOKING_ATTEMPT',
        targetMemberUid,
        sourceMemberUid: requesterMember.uid,
        data: {},
        hasFollowUp: false,
      },
    });

    try {
      const payload: any = {
        isPriority: true,
        deliveryChannel: NOTIFICATION_CHANNEL.EMAIL,
        templateName: EMAIL_TEMPLATES.BROKEN_OH_BOOKING_ATTEMPT,
        recipientsInfo: { to: [target.email] },
        deliveryPayload: {
          body: {
            targetName: target.name,
            targetUid: target.uid,
            requesterName: requesterMember.name,
            requesterUid: requesterMember.uid,
            link: `${process.env.WEB_UI_BASE_URL}/members/${
              target.uid
            }?utm_source=oh_broken_link_book_attempt&target_uid=${target.uid}&target_email=${encodeURIComponent(
              target.email || ''
            )}&requester_uid=${requesterMember.uid}&requester_email=${encodeURIComponent(requesterMember.email || '')}`,
          },
        },
        entityType: NOTIFICATION_ENTITY_TYPES.OFFICE_HOURS,
        actionType: OFFICE_HOURS_ACTIONS.BROKEN_LINK_ATTEMPT,
        sourceMeta: {
          activityId: target.uid,
          activityType: NOTIFICATION_ENTITY_TYPES.OFFICE_HOURS,
          activityUserId: requesterMember.uid,
          activityUserName: requesterMember.name,
        },
        targetMeta: {
          emailId: target.email,
          userId: target.uid,
          userName: target.name,
        },
      };
      await this.notificationClient.sendNotification(payload);
    } catch (e) {
      this.logger.error('Failed to send broken OH attempt notification', e);
    }

    return { success: true };
  }

  // --- New: When link updated and OK, notify requesters from last 30 days (not yet notified) ---
  async handleLinkUpdated(memberUid: string, newLink: string) {
    const status = await this.checkLink(newLink);
    await this.prisma.member.update({ where: { uid: memberUid }, data: { ohStatus: status } });
    if (status !== 'OK') return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const attempts = await this.prisma.memberInteraction.findMany({
      where: {
        type: 'BROKEN_OH_BOOKING_ATTEMPT',
        targetMemberUid: memberUid,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { sourceMemberUid: true },
    });

    const requesterUids = Array.from(new Set(attempts.map((a) => a.sourceMemberUid)));
    if (!requesterUids.length) return;

    for (const requesterUid of requesterUids) {
      const lastAttempt = await this.prisma.memberInteraction.findFirst({
        where: {
          type: 'BROKEN_OH_BOOKING_ATTEMPT',
          targetMemberUid: memberUid,
          sourceMemberUid: requesterUid,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!lastAttempt) continue;

      const fixedAfter = await this.prisma.memberInteraction.findFirst({
        where: {
          type: 'BROKEN_OH_FIXED_NOTIFICATION_SENT',
          targetMemberUid: memberUid,
          sourceMemberUid: requesterUid,
          createdAt: { gte: lastAttempt.createdAt },
        },
      });
      if (fixedAfter) continue;

      const [target, requester] = await Promise.all([
        this.membersService.findOne(memberUid),
        this.membersService.findOne(requesterUid),
      ]);

      try {
        const payload: any = {
          isPriority: true,
          deliveryChannel: NOTIFICATION_CHANNEL.EMAIL,
          templateName: EMAIL_TEMPLATES.BROKEN_OH_LINK_FIXED,
          recipientsInfo: { to: [requester.email] },
          deliveryPayload: {
            body: {
              targetName: target.name,
              targetUid: target.uid,
              requesterName: requester.name,
              requesterUid: requester.uid,
              link: `${process.env.WEB_UI_BASE_URL}/members/${target.uid}?utm_source=oh_broken_link_fixed&target_uid=${
                target.uid
              }&target_email=${encodeURIComponent(target.email || '')}&requester_uid=${
                requester.uid
              }&requester_email=${encodeURIComponent(requester.email || '')}`,
            },
          },
          entityType: NOTIFICATION_ENTITY_TYPES.OFFICE_HOURS,
          actionType: OFFICE_HOURS_ACTIONS.BROKEN_LINK_FIXED,
          sourceMeta: {
            activityId: target.uid,
            activityType: NOTIFICATION_ENTITY_TYPES.OFFICE_HOURS,
            activityUserId: target.uid,
            activityUserName: target.name,
          },
          targetMeta: {
            emailId: requester.email,
            userId: requester.uid,
            userName: requester.name,
          },
        };
        await this.notificationClient.sendNotification(payload);
        await this.prisma.memberInteraction.create({
          data: {
            type: 'BROKEN_OH_FIXED_NOTIFICATION_SENT',
            targetMemberUid: memberUid,
            sourceMemberUid: requesterUid,
            data: {},
            hasFollowUp: false,
          },
        });
      } catch (e) {
        this.logger.error('Failed to notify requester about fixed OH link', e);
      }
    }
  }

  async checkAndUpdateMemberLink(memberUid: string) {
    const member = await this.membersService.findOne(memberUid);
    const link = member?.officeHours as string | null;
    const status = await this.checkLink(link || '');
    await this.prisma.member.update({ where: { uid: memberUid }, data: { ohStatus: status } });
    return { uid: memberUid, ohStatus: status };
  }

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on interactions:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on interactions', error.message);
        case 'P2025':
          throw new NotFoundException('Interactions is not found with uid:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Interactions', error.message);
    }
    throw error;
  }

  // --- New: Office hours link checks ---
  private normalizeUrl(link: string): string {
    if (!link) return link;

    let normalizedLink = link.trim();

    // Add protocol if missing
    if (!normalizedLink.match(/^https?:\/\//i)) {
      normalizedLink = `https://${normalizedLink}`;
    }

    // Remove trailing slashes for consistency
    normalizedLink = normalizedLink.replace(/\/+$/, '');

    return normalizedLink;
  }
}
