import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DemoDay, DemoDayParticipantStatus, DemoDayStatus, PushNotificationCategory } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { MembersService } from '../members/members.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { CreateDemoDayInvestorApplicationDto } from '@protocol-labs-network/contracts';
import { isDirectoryAdmin, hasDemoDayAdminRole, MemberWithRoles, MemberRole } from '../utils/constants';
import { NotificationServiceClient } from '../notifications/notification-service.client';

type ExpressInterestStats = {
  liked: number;
  connected: number;
  invested: number;
  referral: number;
  feedback: number;
  total: number;
};

// Statuses that trigger notifications
const NOTIFIABLE_STATUSES: DemoDayStatus[] = [
  DemoDayStatus.UPCOMING,
  DemoDayStatus.REGISTRATION_OPEN,
  DemoDayStatus.EARLY_ACCESS,
  DemoDayStatus.ACTIVE,
];

export type ChannelType =
  | 'SUPPORT'
  | 'DEMO_DAY_SUBSCRIPTION'
  | 'DEMO_DAY_APPLICATION'
  | 'DEMO_DAY_APPLICATION_FOUNDERS_FORGE'
  | 'DEMO_DAY_APPLICATION_CRECIMIENTO'
  | 'DEMO_DAY_APPLICATION_FOUNDER_SCHOOL'
  | 'DEMO_DAY_APPLICATION_PROTOCOL_LABS'
  | 'DEFAULT';

function formatDateMMDDYYYY(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}.${dd}.${yyyy}`;
}

function resolveChannelTypeAndApplicationDate(args: {
  host?: string | null;
  applicationStartDate: Date;
}): { channelType: ChannelType; applicationDate: string } {
  const host = (args.host ?? '').trim().toLowerCase();

  let channelType: ChannelType = 'DEMO_DAY_APPLICATION';

  if (host === 'founders forge') channelType = 'DEMO_DAY_APPLICATION_FOUNDERS_FORGE';
  else if (host === 'crecimiento') channelType = 'DEMO_DAY_APPLICATION_CRECIMIENTO';
  else if (host === 'founder school') channelType = 'DEMO_DAY_APPLICATION_FOUNDER_SCHOOL';
  else if (host === 'protocol labs') channelType = 'DEMO_DAY_APPLICATION_PROTOCOL_LABS';

  return {
    channelType,
    applicationDate: formatDateMMDDYYYY(args.applicationStartDate),
  };
}

@Injectable()
export class DemoDaysService {
  private readonly logger = new Logger(DemoDaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly membersService: MembersService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) { }

  // Public methods

  async getDemoDayAccess(
    memberEmail: string | null,
    demoDayUidOrSlug: string
  ): Promise<{
    access: 'none' | 'INVESTOR' | 'FOUNDER' | 'SUPPORT';
    status: 'NONE' | 'UPCOMING' | 'REGISTRATION_OPEN' | 'ACTIVE' | 'COMPLETED';
    uid?: string;
    slugURL?: string;
    host?: string | null;
    date?: string;
    title?: string;
    description?: string;
    shortDescription?: string | null;
    approximateStartDate?: string | null;
    supportEmail?: string | null;
    teamsCount?: number;
    investorsCount?: number;
    isDemoDayAdmin?: boolean;
    isEarlyAccess?: boolean;
    isPending?: boolean;
    confidentialityAccepted?: boolean;
  }> {
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      return {
        access: 'none',
        status: 'NONE',
        teamsCount: 0,
        investorsCount: 0,
        confidentialityAccepted: false,
        isPending: false,
      };
    }

    const [investorsCount, teamsCount] = await Promise.all([
      this.getQualifiedInvestorsCount(),
      this.getTeamsCountForDemoDay(demoDay.uid),
    ]);

    // Handle unauthorized users
    if (!memberEmail) {
      return {
        access: 'none',
        uid: demoDay.uid,
        slugURL: demoDay.slugURL,
        status: this.getExternalDemoDayStatus(demoDay.status),
        host: demoDay.host,
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        shortDescription: demoDay.shortDescription,
        approximateStartDate: demoDay.approximateStartDate,
        supportEmail: demoDay.supportEmail,
        teamsCount: teamsCount,
        investorsCount: investorsCount,
        confidentialityAccepted: false,
        isPending: false,
      };
    }

    const member = await this.getMemberWithDemoDayParticipants(memberEmail, demoDay.uid);

    if (!member || ['Rejected'].includes(member?.accessLevel ?? '')) {
      return {
        access: 'none',
        uid: demoDay.uid,
        slugURL: demoDay.slugURL,
        status: this.getExternalDemoDayStatus(demoDay.status),
        host: demoDay.host,
        isPending: false,
      };
    }

    // Check if member has demo day admin access (super admin or DEMO_DAY_ADMIN role with matching host scope)
    const hasMemberLevelAdminAccess = this.hasDemoDayAdminAccess(member, demoDay.host);

    // Check demo day participant
    const participant = member.demoDayParticipants[0];
    if (participant && participant.status !== 'ENABLED') {
      return {
        access: 'none',
        uid: demoDay.uid,
        slugURL: demoDay.slugURL,
        status: this.getExternalDemoDayStatus(demoDay.status),
        host: demoDay.host,
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        shortDescription: demoDay.shortDescription,
        approximateStartDate: demoDay.approximateStartDate,
        supportEmail: demoDay.supportEmail,
        teamsCount,
        investorsCount,
        confidentialityAccepted: participant.confidentialityAccepted,
        isPending: participant.status === DemoDayParticipantStatus.PENDING,
      };
    }

    if (participant && participant.status === 'INVITED') {
      participant.status = 'ENABLED';
      await this.prisma.demoDayParticipant.update({
        where: { uid: participant.uid },
        data: { status: 'ENABLED' },
      });
    }

    if (participant && participant.status === 'ENABLED') {
      // Member is an enabled participant
      const access = participant.type;

      return {
        access,
        uid: demoDay.uid,
        slugURL: demoDay.slugURL,
        host: demoDay.host,
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        shortDescription: demoDay.shortDescription,
        approximateStartDate: demoDay.approximateStartDate,
        supportEmail: demoDay.supportEmail,
        status: this.getExternalDemoDayStatus(
          demoDay.status,
          participant.type === 'FOUNDER' || participant.hasEarlyAccess
        ),
        isEarlyAccess: demoDay.status === DemoDayStatus.EARLY_ACCESS,
        isDemoDayAdmin: participant.isDemoDayAdmin || hasMemberLevelAdminAccess,
        confidentialityAccepted: participant.confidentialityAccepted,
        teamsCount,
        investorsCount,
        isPending: false,
      };
    }

    return {
      access: 'none',
      slugURL: demoDay.slugURL,
      status: this.getExternalDemoDayStatus(demoDay.status),
      host: demoDay.host,
      date: demoDay.startDate.toISOString(),
      title: demoDay.title,
      description: demoDay.description,
      shortDescription: demoDay.shortDescription,
      approximateStartDate: demoDay.approximateStartDate,
      supportEmail: demoDay.supportEmail,
      teamsCount,
      investorsCount,
      confidentialityAccepted: false,
      isPending: false,
    };
  }

  // Admin methods

  async createDemoDay(
    data: {
      startDate: Date;
      endDate: Date;
      title: string;
      slugURL: string;
      description: string;
      shortDescription?: string | null;
      approximateStartDate?: string | null;
      supportEmail?: string | null;
      host: string;
      status: DemoDayStatus;
    },
    actorEmail?: string
  ): Promise<DemoDay> {
    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    // Check if slug already exists
    const slugURL = data.slugURL;
    const existingDemoDay = await this.prisma.demoDay.findFirst({ where: { slugURL, isDeleted: false } });
    if (existingDemoDay) {
      throw new ConflictException(
        `A demo day with slug "${slugURL}" already exists. Please choose a different title or slug.`
      );
    }

    const created = await this.prisma.demoDay.create({
      data: {
        startDate: data.startDate,
        endDate: data.endDate,
        title: data.title,
        description: data.description,
        shortDescription: data.shortDescription,
        approximateStartDate: data.approximateStartDate,
        supportEmail: data.supportEmail,
        host: data.host,
        status: data.status,
        slugURL,
      },
    });

    // Track "Demo Day created"
    await this.analyticsService.trackEvent({
      name: 'demo-day-created',
      distinctId: created.uid,
      properties: {
        demoDayUid: created.uid,
        title: created.title,
        description: created.description,
        shortDescription: created.shortDescription,
        startDate: created.startDate?.toISOString?.() || null,
        endDate: created.endDate?.toISOString?.() || null,
        host: created.host || null,
        status: created.status,
        actorUid: actorUid || null,
        actorEmail: actorEmail || null,
      },
    });

    return created;
  }

  async getAllDemoDays(): Promise<DemoDay[]> {
    return this.prisma.demoDay.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        approximateStartDate: true,
        title: true,
        description: true,
        shortDescription: true,
        supportEmail: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
        host: true,
        notificationsEnabled: true,
        notifyBeforeStartHours: true,
        notifyBeforeEndHours: true,
        dashboardEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all demo days for admin back-office.
   * - DIRECTORYADMIN: sees all demo days
   * - DEMO_DAY_ADMIN: sees only demo days where their MemberDemoDayAdminScope.scopeValue matches DemoDay.host
   */
  async getAllDemoDaysForAdmin(userRoles: string[], memberUid?: string): Promise<DemoDay[]> {
    const isDirectoryAdmin = userRoles.includes(MemberRole.DIRECTORY_ADMIN);

    // Directory admins see all demo days
    if (isDirectoryAdmin) {
      return this.getAllDemoDays();
    }

    // DEMO_DAY_ADMIN: filter by their admin scopes
    if (!memberUid) {
      return [];
    }

    // Get the member's demo day admin scopes (HOST type)
    const adminScopes = await this.prisma.memberDemoDayAdminScope.findMany({
      where: {
        memberUid,
        scopeType: 'HOST',
      },
      select: {
        scopeValue: true,
      },
    });

    const allowedHosts = adminScopes.map((scope) => scope.scopeValue);

    if (allowedHosts.length === 0) {
      return [];
    }

    // Return demo days that match the allowed hosts
    return this.prisma.demoDay.findMany({
      where: {
        isDeleted: false,
        host: { in: allowedHosts },
      },
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        approximateStartDate: true,
        title: true,
        description: true,
        shortDescription: true,
        supportEmail: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
        host: true,
        notificationsEnabled: true,
        notifyBeforeStartHours: true,
        notifyBeforeEndHours: true,
        dashboardEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllDemoDaysPublic(memberEmail?: string | null) {
    // Get all demo days and member info in parallel
    const [demoDays, member, investorsCount] = await Promise.all([
      this.prisma.demoDay.findMany({
        where: { isDeleted: false, status: { not: DemoDayStatus.ARCHIVED } },
        orderBy: { createdAt: 'desc' },
      }),
      memberEmail ? this.getMemberWithDemoDayParticipants(memberEmail) : Promise.resolve(null),
      this.getQualifiedInvestorsCount(),
    ]);

    // For each demo day, get counts and determine access
    return await Promise.all(
      demoDays
        .sort((a, b) => {
          // Define sort order: ACTIVE(0), EARLY_ACCESS(1), REGISTRATION_OPENED(2), UPCOMING(3), COMPLETED(4)
          const statusOrder = {
            [DemoDayStatus.ACTIVE]: 0,
            [DemoDayStatus.EARLY_ACCESS]: 1,
            [DemoDayStatus.REGISTRATION_OPEN]: 2,
            [DemoDayStatus.UPCOMING]: 3,
            [DemoDayStatus.COMPLETED]: 4,
          };

          const aOrder = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 999;
          const bOrder = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 999;

          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          // Same status: sort by startDate ascending
          const aDate = a.startDate instanceof Date ? a.startDate.getTime() : new Date(a.startDate).getTime();
          const bDate = b.startDate instanceof Date ? b.startDate.getTime() : new Date(b.startDate).getTime();
          return aDate - bDate;
        })
        .map(async (demoDay) => {
          const teamsCount = await this.getTeamsCountForDemoDay(demoDay.uid);

          // Check member-level admin access for this specific demo day (host-scoped)
          const hasMemberLevelAdminAccess = member ? this.hasDemoDayAdminAccess(member, demoDay.host) : false;

          // Determine access for this demo day
          let access: 'none' | 'INVESTOR' | 'FOUNDER' | 'SUPPORT' = 'none';
          let isDemoDayAdmin = false;
          let isEarlyAccess = false;
          let isPending = false;
          let confidentialityAccepted = false;

          if (member && !['L0', 'L1', 'Rejected'].includes(member.accessLevel ?? '')) {
            const participant = member.demoDayParticipants.find(
              (p: { demoDayUid: string }) => p.demoDayUid === demoDay.uid
            );

            if (participant && participant.status === 'ENABLED') {
              access = participant.type;
              isDemoDayAdmin = participant.isDemoDayAdmin || hasMemberLevelAdminAccess;
              isEarlyAccess = demoDay.status === DemoDayStatus.EARLY_ACCESS;
              confidentialityAccepted = participant.confidentialityAccepted;
            }

            isPending = participant?.status === DemoDayParticipantStatus.PENDING;
          }

          // Return different data based on access level (similar to getDemoDayAccess)
          const baseResponse = {
            slugURL: demoDay.slugURL,
            date: demoDay.startDate.toISOString(),
            title: demoDay.title,
            description: demoDay.description,
            shortDescription: demoDay.shortDescription,
            approximateStartDate: demoDay.approximateStartDate,
            supportEmail: demoDay.supportEmail,
            access,
            host: demoDay.host,
            status: this.getExternalDemoDayStatus(
              demoDay.status,
              access === 'FOUNDER' ||
              (member?.demoDayParticipants.find((p: { demoDayUid: string }) => p.demoDayUid === demoDay.uid)
                ?.hasEarlyAccess ??
                false)
            ),
            teamsCount: access !== 'none' ? teamsCount : 0,
            investorsCount: access !== 'none' ? investorsCount : 0,
            confidentialityAccepted,
          };

          // Only include these fields for authorized users
          if (access !== 'none') {
            return {
              ...baseResponse,
              uid: demoDay.uid,
              isDemoDayAdmin,
              isEarlyAccess,
              isPending,
            };
          }

          return baseResponse;
        })
    );
  }

  async getDemoDayByUidOrSlug(uidOrSlug: string): Promise<DemoDay> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: { OR: [{ uid: uidOrSlug }, { slugURL: uidOrSlug }], isDeleted: false },
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        approximateStartDate: true,
        title: true,
        description: true,
        shortDescription: true,
        supportEmail: true,
        status: true,
        host: true,
        notificationsEnabled: true,
        notifyBeforeStartHours: true,
        notifyBeforeEndHours: true,
        dashboardEnabled: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    if (!demoDay) {
      throw new NotFoundException(`Demo day with uid or slug ${uidOrSlug} not found`);
    }

    return demoDay;
  }

  async getDemoDayBySlugURL(slugURL: string): Promise<DemoDay> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: { slugURL, isDeleted: false },
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        approximateStartDate: true,
        title: true,
        description: true,
        shortDescription: true,
        supportEmail: true,
        status: true,
        host: true,
        notificationsEnabled: true,
        notifyBeforeStartHours: true,
        notifyBeforeEndHours: true,
        dashboardEnabled: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    if (!demoDay) {
      throw new NotFoundException(`Demo day with slug ${slugURL} not found`);
    }

    return demoDay;
  }

  async updateDemoDay(
    uid: string,
    data: {
      startDate?: Date;
      endDate?: Date;
      title?: string;
      slugURL?: string;
      description?: string;
      shortDescription?: string | null;
      approximateStartDate?: string | null;
      supportEmail?: string | null;
      status?: DemoDayStatus;
      host?: string | null;
      notificationsEnabled?: boolean;
      notifyBeforeStartHours?: number | null;
      notifyBeforeEndHours?: number | null;
      dashboardEnabled?: boolean;
    },
    actorEmail?: string
  ): Promise<DemoDay> {
    // First check if demo day exists
    const before = await this.getDemoDayByUidOrSlug(uid);

    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    // Check if slugURL is being updated and if it conflicts with existing demo day
    if (data.slugURL !== undefined && data.slugURL !== before.slugURL) {
      const existingDemoDay = await this.prisma.demoDay.findFirst({
        where: { slugURL: data.slugURL, isDeleted: false, uid: { not: uid } },
      });
      if (existingDemoDay) {
        throw new ConflictException(
          `A demo day with slug "${data.slugURL}" already exists. Please choose a different slug.`
        );
      }
    }

    const updateData: any = {};

    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate;
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate;
    }
    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.slugURL !== undefined) {
      updateData.slugURL = data.slugURL;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.shortDescription !== undefined) {
      updateData.shortDescription = data.shortDescription;
    }
    if (data.approximateStartDate !== undefined) {
      updateData.approximateStartDate = data.approximateStartDate;
    }
    if (data.supportEmail !== undefined) {
      updateData.supportEmail = data.supportEmail;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.host !== undefined) {
      updateData.host = data.host;
    }
    if (data.notificationsEnabled !== undefined) {
      updateData.notificationsEnabled = data.notificationsEnabled;
    }
    if (data.notifyBeforeStartHours !== undefined) {
      updateData.notifyBeforeStartHours = data.notifyBeforeStartHours;
    }
    if (data.notifyBeforeEndHours !== undefined) {
      updateData.notifyBeforeEndHours = data.notifyBeforeEndHours;
    }
    if (data.dashboardEnabled !== undefined) {
      updateData.dashboardEnabled = data.dashboardEnabled;
    }

    const updated = await this.prisma.demoDay.update({
      where: { uid },
      data: updateData,
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        approximateStartDate: true,
        title: true,
        description: true,
        shortDescription: true,
        supportEmail: true,
        status: true,
        host: true,
        notificationsEnabled: true,
        notifyBeforeStartHours: true,
        notifyBeforeEndHours: true,
        dashboardEnabled: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    // Track "details updated" (name/description/startDate/endDate/slugURL) only if any changed
    const detailsChanged: string[] = [];
    if (updateData.title !== undefined && before.title !== updated.title) detailsChanged.push('title');
    if (updateData.slugURL !== undefined && before.slugURL !== updated.slugURL) detailsChanged.push('slugURL');
    if (updateData.description !== undefined && before.description !== updated.description)
      detailsChanged.push('description');
    if (updateData.startDate !== undefined && before.startDate?.toISOString?.() !== updated.startDate?.toISOString?.())
      detailsChanged.push('startDate');
    if (updateData.endDate !== undefined && before.endDate?.toISOString?.() !== updated.endDate?.toISOString?.())
      detailsChanged.push('endDate');

    if (detailsChanged.length > 0) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-details-updated',
        distinctId: updated.uid,
        properties: {
          demoDayUid: updated.uid,
          changedFields: detailsChanged,
          title: updated.title,
          description: updated.description,
          startDate: updated.startDate?.toISOString?.() || null,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });
    }

    // Track "status updated" if changed
    const isStatusChanged = updateData.status !== undefined && before.status !== updated.status;
    if (isStatusChanged) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-status-updated',
        distinctId: updated.uid,
        properties: {
          demoDayUid: updated.uid,
          fromStatus: before.status,
          toStatus: updated.status,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });

      // Send Demo Day announcement notification if enabled
      await this.sendDemoDayStatusNotification(updated);
    }

    const isEnablingNotifications = !before.notificationsEnabled && updated.notificationsEnabled;
    if (isEnablingNotifications && !isStatusChanged) {
      await this.sendDemoDayStatusNotification(updated);
    }

    return updated;
  }

  private getExternalDemoDayStatus(
    demoDayStatus: DemoDayStatus,
    hasEarlyAccess = false
  ): 'UPCOMING' | 'REGISTRATION_OPEN' | 'ACTIVE' | 'COMPLETED' {
    if (demoDayStatus === DemoDayStatus.REGISTRATION_OPEN) {
      return 'REGISTRATION_OPEN';
    }

    // Never return EARLY_ACCESS to frontend - if hasEarlyAccess is true, return ACTIVE, otherwise return UPCOMING
    if (demoDayStatus === DemoDayStatus.EARLY_ACCESS) {
      if (hasEarlyAccess) {
        return 'ACTIVE';
      } else {
        return 'REGISTRATION_OPEN';
      }
    }

    return demoDayStatus.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  }

  async getCurrentExpressInterestStats(
    isPrepDemoDay: boolean,
    demoDayUidOrSlug: string
  ): Promise<ExpressInterestStats> {
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    const agg = await this.prisma.demoDayExpressInterestStatistic.aggregate({
      where: {
        demoDayUid: demoDay.uid,
        isPrepDemoDay,
      },
      _sum: {
        likedCount: true,
        connectedCount: true,
        investedCount: true,
        referralCount: true,
        feedbackCount: true,
      },
    });

    const liked = agg._sum.likedCount ?? 0;
    const connected = agg._sum.connectedCount ?? 0;
    const invested = agg._sum.investedCount ?? 0;
    const referral = agg._sum.referralCount ?? 0;
    const feedback = agg._sum.feedbackCount ?? 0;
    const total = liked + connected + invested + referral + feedback;

    return { liked, connected, invested, referral, feedback, total };
  }

  async updateConfidentialityAcceptance(
    memberEmail: string,
    accepted: boolean,
    demoDayUidOrSlug: string
  ): Promise<{ success: boolean }> {
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const existingParticipant = await this.prisma.demoDayParticipant.findUnique({
      where: {
        demoDayUid_memberUid: {
          demoDayUid: demoDay.uid,
          memberUid: member.uid,
        },
      },
    });

    if (existingParticipant) {
      await this.prisma.demoDayParticipant.update({
        where: { uid: existingParticipant.uid },
        data: { confidentialityAccepted: accepted },
      });
    }

    return { success: true };
  }

  async getTeamAnalytics(teamUid: string, demoDayUidOrSlug: string) {
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    // Find the fundraising profile for this team
    const fundraisingProfile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      select: {
        uid: true,
        team: {
          select: {
            uid: true,
            name: true,
          },
        },
      },
    });

    if (!fundraisingProfile) {
      throw new NotFoundException('Team fundraising profile not found for current demo day');
    }

    // Get all interest statistics for this team's fundraising profile
    const allStats = await this.prisma.demoDayExpressInterestStatistic.findMany({
      where: {
        demoDayUid: demoDay.uid,
        teamFundraisingProfileUid: fundraisingProfile.uid,
      },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
            teamMemberRoles: {
              where: {
                investmentTeam: true,
              },
              include: {
                team: {
                  select: {
                    uid: true,
                    name: true,
                    isFund: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Calculate summary statistics
    const uniqueInvestors = new Set(allStats.map((s) => s.memberUid)).size;
    const totalLikes = allStats.filter((s) => s.liked).length;
    const totalConnections = allStats.filter((s) => s.connected).length;
    const totalInvestments = allStats.filter((s) => s.invested).length;
    const totalReferrals = allStats.filter((s) => s.referral).length;
    const totalFeedbacks = allStats.filter((s) => s.feedback).length;
    const totalEngagement = allStats.reduce((sum, s) => sum + s.totalCount, 0);

    // Build investor activity list
    const investorActivity = allStats
      .filter((s) => s.totalCount > 0) // Only show investors who have engaged
      .map((stat) => {
        const investmentTeamRole = stat.member.teamMemberRoles.find((role) => role.investmentTeam);
        const fundOrAngel = investmentTeamRole?.team;

        return {
          investorUid: stat.member.uid,
          investorName: stat.member.name,
          investorEmail: stat.member.email,
          fundOrAngel: fundOrAngel
            ? {
              uid: fundOrAngel.uid,
              name: fundOrAngel.name,
              isFund: fundOrAngel.isFund,
            }
            : null,
          activity: {
            liked: stat.liked,
            connected: stat.connected,
            invested: stat.invested,
            referral: stat.referral,
            feedback: stat.feedback,
          },
          date: stat.updatedAt,
        };
      });

    // Group engagement by time
    // Use Event table for time-series data, but only count first occurrence of each action per investor
    const engagementOverTime = await this.prisma.$queryRaw<
      Array<{ hour: Date; likes: bigint; connects: bigint; invests: bigint; referrals: bigint; feedbacks: bigint }>
    >`
      WITH first_events AS (
        SELECT DISTINCT ON ("userId", props->>'teamUid', props->>'interestType')
          "userId",
          props->>'interestType' as interest_type,
          props->>'teamUid' as team_uid,
          ts
        FROM "Event"
        WHERE "eventType" = 'demo-day-express-interest'
          AND props->>'demoDayUid' = ${demoDay.uid}
          AND props->>'teamUid' = ${fundraisingProfile.team.uid}
        ORDER BY "userId", props->>'teamUid', props->>'interestType', ts
      )
      SELECT
        DATE_TRUNC('hour', ts) as hour,
        COUNT(*) FILTER (WHERE interest_type = 'like') as likes,
        COUNT(*) FILTER (WHERE interest_type = 'connect') as connects,
        COUNT(*) FILTER (WHERE interest_type = 'invest') as invests,
        COUNT(*) FILTER (WHERE interest_type = 'referral') as referrals,
        COUNT(*) FILTER (WHERE interest_type = 'feedback') as feedbacks
      FROM first_events
      GROUP BY DATE_TRUNC('hour', ts)
      ORDER BY hour
    `;

    return {
      team: {
        uid: fundraisingProfile.team.uid,
        name: fundraisingProfile.team.name,
      },
      demoDay: {
        uid: demoDay.uid,
        title: demoDay.title,
      },
      summary: {
        totalEngagement,
        uniqueInvestors,
        likes: totalLikes,
        connections: totalConnections,
        investments: totalInvestments,
        referrals: totalReferrals,
        feedbacks: totalFeedbacks,
      },
      engagementOverTime: engagementOverTime.map((row) => ({
        timestamp: row.hour,
        likes: Number(row.likes),
        connects: Number(row.connects),
        invests: Number(row.invests),
        referrals: Number(row.referrals),
        feedbacks: Number(row.feedbacks),
      })),
      investorActivity,
    };
  }

  async createFeedback(
    memberEmail: string,
    feedbackData: {
      rating: number;
      qualityComments?: string | null;
      improvementComments?: string | null;
      comment?: string | null;
      issues: string[];
    },
    demoDayUidOrSlug: string
  ) {
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Create feedback (multiple submissions allowed)
    const feedback = await this.prisma.demoDayFeedback.create({
      data: {
        demoDayUid: demoDay.uid,
        memberUid: member.uid,
        rating: feedbackData.rating,
        qualityComments: feedbackData.qualityComments || null,
        improvementComments: feedbackData.improvementComments || null,
        comment: feedbackData.comment || null,
        issues: feedbackData.issues,
      },
    });

    // Track analytics event
    await this.analyticsService.trackEvent({
      name: 'demo-day-feedback-submitted',
      distinctId: member.uid,
      properties: {
        demoDayUid: demoDay.uid,
        feedbackUid: feedback.uid,
        rating: feedback.rating,
        hasComment: !!feedback.comment,
        hasQualityComments: !!feedback.qualityComments,
        hasImprovementComments: !!feedback.improvementComments,
        qualityComments: feedback.qualityComments,
        improvementComments: feedback.improvementComments,
        issuesCount: feedback.issues.length,
        issues: feedback.issues,
      },
    });

    return feedback;
  }

  async submitInvestorApplication(applicationData: CreateDemoDayInvestorApplicationDto, demoDayUidOrSlug: string) {
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    // Check if demo day is accepting applications
    if (
      demoDay.status !== DemoDayStatus.REGISTRATION_OPEN &&
      demoDay.status !== DemoDayStatus.EARLY_ACCESS &&
      demoDay.status !== DemoDayStatus.ACTIVE
    ) {
      throw new BadRequestException('Demo day is not currently accepting applications');
    }

    const normalizedEmail = applicationData.email.toLowerCase().trim();

    this.logger.debug(
      `[submitInvestorApplication] start demoDay=${demoDay.uid} slug=${demoDay.slugURL} email=${normalizedEmail} ` +
      `isTeamNew=${!!applicationData.isTeamNew} teamUid=${applicationData.teamUid ?? '-'} projectUid=${applicationData.projectUid ?? '-'
      }`
    );

    // Check if a member already exists
    let member = await this.prisma.member.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      select: {
        uid: true,
        email: true,
        accessLevel: true,
        investorProfile: true,
        linkedinHandler: true,
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
          },
        },
      },
    });

    let isNewMember = false;

    // If a member doesn't exist, create a new one with L0 access level
    if (!member) {
      isNewMember = true;

      this.logger.debug(
        `[submitInvestorApplication] creating new member demoDay=${demoDay.uid} email=${normalizedEmail}`
      );

      member = await this.prisma.member.create({
        data: {
          email: normalizedEmail,
          name: applicationData.name,
          accessLevel: 'L0',
          signUpSource: `demoday-${demoDay.slugURL}`,
          linkedinHandler: applicationData.linkedinProfile,
          role: applicationData.role?.trim(),
        },
        select: {
          uid: true,
          email: true,
          accessLevel: true,
          investorProfile: true,
          linkedinHandler: true,
          demoDayParticipants: {
            where: {
              demoDayUid: demoDay.uid,
              isDeleted: false,
            },
          },
        },
      });

      // If a teamUid is provided, create TeamMemberRole
      // Check if TeamMemberRole already exists for this member-team combination
      if (!applicationData.isTeamNew && applicationData.teamUid) {
        const existingRole = await this.prisma.teamMemberRole.findUnique({
          where: {
            memberUid_teamUid: {
              memberUid: member.uid,
              teamUid: applicationData.teamUid,
            },
          },
        });

        // Only create if it doesn't exist
        if (!existingRole) {
          await this.prisma.teamMemberRole.create({
            data: {
              memberUid: member.uid,
              teamUid: applicationData.teamUid,
              role: applicationData.role,
              investmentTeam: true,
              mainTeam: true,
            },
          });
        }
      }

      // If a projectUid is provided, create ProjectContribution
      if (applicationData.projectUid) {
        const existingContribution = await this.prisma.projectContribution.findFirst({
          where: {
            memberUid: member.uid,
            projectUid: applicationData.projectUid,
          },
        });

        if (!existingContribution) {
          await this.prisma.projectContribution.create({
            data: {
              memberUid: member.uid,
              projectUid: applicationData.projectUid,
              role: applicationData.role,
              currentProject: true,
            },
          });
        }
      }
    } else {
      await this.prisma.member.update({
        where: { uid: member.uid },
        data: {
          linkedinHandler: applicationData.linkedinProfile || member.linkedinHandler,
          role: applicationData.role?.trim(),
        },
      });

      this.logger.debug(
        `[submitInvestorApplication] existing member found uid=${member.uid} email=${normalizedEmail} accessLevel=${member.accessLevel ?? '-'
        }`
      );
    }

    // ===========================
    // create NEW TEAM also for existing/logged-in member
    // set member as team lead
    // ===========================
    let createdTeamUid: string | null = null;
    let createdTeamName: string | null = null;

    if (applicationData.isTeamNew && applicationData.team?.name?.trim()) {
      const teamName = applicationData.team.name.trim();
      const teamWebsite = applicationData.team.website?.trim() || null;

      this.logger.log(
        `[submitInvestorApplication] creating NEW team for member uid=${member.uid} name="${teamName}" website=${teamWebsite ?? '-'
        }`
      );

      const existingTeam = await this.prisma.team.findFirst({
        where: {
          name: {
            equals: teamName,
            mode: 'insensitive',
          },
        },
      });

      if (existingTeam) {
        throw new BadRequestException(
          `Team '${teamName}' already exists. Please use a different name or select the existing team.`
        );
      }

      const createdTeam = await this.prisma.team.create({
        data: {
          name: teamName,
          website: teamWebsite,
          accessLevel: 'L0',
        },
        select: {
          uid: true,
          name: true,
        },
      });

      createdTeamUid = createdTeam.uid;
      createdTeamName = createdTeam.name;

      // Ensure membership exists (safe for retries)
      const existingRoles = await this.prisma.teamMemberRole.findMany({
        where: {
          memberUid: member.uid,
        },
      });
      const existingMainTeamRole = existingRoles.find((r) => r.mainTeam);
      const existingRole = existingRoles.find((r) => r.teamUid === createdTeam.uid);

      if (!existingRole) {
        await this.prisma.teamMemberRole.create({
          data: {
            memberUid: member.uid,
            teamUid: createdTeam.uid,
            role: applicationData.role,
            investmentTeam: true,
            mainTeam: !existingMainTeamRole,
            teamLead: true,
          },
        });

        this.logger.log(
          `[submitInvestorApplication] created TeamMemberRole for NEW team teamUid=${createdTeam.uid} memberUid=${member.uid} mainTeam=true`
        );
      } else {
        this.logger.log(
          `[submitInvestorApplication] TeamMemberRole already exists for NEW team teamUid=${createdTeam.uid} memberUid=${member.uid}`
        );
      }
    }

    // Create or update investor profile
    if (!member.investorProfile) {
      const investorProfile = await this.prisma.investorProfile.create({
        data: {
          memberUid: member.uid,
          investmentFocus: [], // Will be filled in later by the investor
          secRulesAccepted: applicationData.isAccreditedInvestor ?? false,
          secRulesAcceptedAt: applicationData.isAccreditedInvestor ? new Date() : null,
        },
      });

      // Link investor profile to member
      await this.prisma.member.update({
        where: { uid: member.uid },
        data: { investorProfileId: investorProfile.uid },
      });

      this.logger.debug(
        `[submitInvestorApplication] investorProfile created uid=${investorProfile.uid} memberUid=${member.uid}`
      );
    } else if (applicationData.isAccreditedInvestor && !member.investorProfile.secRulesAccepted) {
      // Update existing profile if user accepted accredited investor terms
      await this.prisma.investorProfile.update({
        where: { uid: member.investorProfile.uid },
        data: {
          secRulesAccepted: true,
          secRulesAcceptedAt: new Date(),
        },
      });

      this.logger.debug(
        `[submitInvestorApplication] investorProfile updated secRulesAccepted=true memberUid=${member.uid}`
      );
    }

    // Check if already a participant for this demo day
    if (member.demoDayParticipants && member.demoDayParticipants.length > 0) {
      this.logger.warn(
        `[submitInvestorApplication] already applied demoDay=${demoDay.uid} memberUid=${member.uid} email=${normalizedEmail}`
      );
      throw new BadRequestException('You have already submitted an application for this demo day');
    }

    // If a teamUid is provided (existing team path), create TeamMemberRole
    if (!applicationData.isTeamNew && applicationData.teamUid) {
      const existingRole = await this.prisma.teamMemberRole.findUnique({
        where: {
          memberUid_teamUid: {
            memberUid: member.uid,
            teamUid: applicationData.teamUid,
          },
        },
      });

      // Only create if it doesn't exist
      if (!existingRole) {
        await this.prisma.teamMemberRole.create({
          data: {
            memberUid: member.uid,
            teamUid: applicationData.teamUid,
            role: applicationData.role,
            investmentTeam: true,
            mainTeam: true,
          },
        });

        this.logger.debug(
          `[submitInvestorApplication] created TeamMemberRole for existing team teamUid=${applicationData.teamUid} memberUid=${member.uid}`
        );
      } else {
        this.logger.debug(
          `[submitInvestorApplication] TeamMemberRole already exists for existing team teamUid=${applicationData.teamUid} memberUid=${member.uid}`
        );
      }
    }

    // Create a demo day participant with PENDING status
    const participant = await this.prisma.demoDayParticipant.create({
      data: {
        demoDayUid: demoDay.uid,
        memberUid: member.uid,
        type: 'INVESTOR',
        status: 'PENDING', // Pending approval from admin
      },
    });

    this.logger.debug(
      `[submitInvestorApplication] participant created uid=${participant.uid} demoDay=${demoDay.uid} memberUid=${member.uid} status=PENDING`
    );

    // Track analytics event
    await this.analyticsService.trackEvent({
      name: 'demo-day-investor-application-submitted',
      distinctId: member.uid,
      properties: {
        demoDayUid: demoDay.uid,
        participantUid: participant.uid,
        email: normalizedEmail,
        name: applicationData.name,
        role: applicationData.role,
        teamUid: applicationData.teamUid,
        linkedinProfile: applicationData.linkedinProfile,
        isAccreditedInvestor: applicationData.isAccreditedInvestor ?? false,
        isNewMember,
      },
    });

    let resolvedTeamName: string | null =
      applicationData.isTeamNew && applicationData.team?.name?.trim() ? applicationData.team.name.trim() : null;

    if (!resolvedTeamName && createdTeamName) {
      resolvedTeamName = createdTeamName;
    }

    if (!resolvedTeamName && applicationData.teamUid) {
      const team = await this.prisma.team.findUnique({
        where: { uid: applicationData.teamUid },
        select: { name: true },
      });
      resolvedTeamName = team?.name ?? null;
    }

    await this.sendTelegramNewDemoDayApplicationAlert({
      demoDay: { uid: demoDay.uid, slugURL: demoDay.slugURL, title: demoDay.title, host: demoDay.host },
      participantUid: participant.uid,
      memberUid: member.uid,
      applicantName: applicationData.name ?? null,
      applicantEmail: normalizedEmail,
      teamName: resolvedTeamName,
      teamUid: createdTeamUid ?? applicationData.teamUid ?? null,
      applicationStartDate: participant.createdAt
    });

    this.logger.debug(
      `[submitInvestorApplication] done participantUid=${participant.uid} isNewMember=${isNewMember} createdTeamUid=${createdTeamUid ?? '-'
      }`
    );

    return {
      memberUid: member.uid,
      participantUid: participant.uid,
      isNewMember: isNewMember,
    };
  }

  /**
   * Check if a member has access to a specific demo day and determine their access level
   * @param memberEmail - Email of the member to check
   * @param demoDayUid - UID of the demo day
   * @returns Participant UID and admin status
   * @throws ForbiddenException if the member has no access
   */
  async checkDemoDayAccess(
    memberEmail: string,
    demoDayUid: string
  ): Promise<{ participantUid: string; isAdmin: boolean }> {
    const member = await this.membersService.findMemberByEmail(memberEmail);

    if (!member) {
      throw new ForbiddenException('No demo day access');
    }

    const demoDay = await this.prisma.demoDay.findUnique({
      where: { uid: demoDayUid },
      select: {
        uid: true,
        host: true,
      },
    });

    if (!demoDay) {
      throw new ForbiddenException('No demo day access');
    }

    // 1) Directory admins always have full access
    const isDirectoryAdmin = this.membersService.checkIfAdminUser(member);
    if (isDirectoryAdmin) {
      return { participantUid: member.uid, isAdmin: true };
    }

    // 2) Demo day admin with host-level scope (generic demoDayAdminScopes table)
    const hasDemoDayAdminRoleFlag = hasDemoDayAdminRole(member);

    if (hasDemoDayAdminRoleFlag) {
      const hostScopes = await this.prisma.memberDemoDayAdminScope.findMany({
        where: {
          memberUid: member.uid,
          scopeType: 'HOST',
        },
        select: {
          scopeValue: true,
        },
      });

      const allowedHosts = hostScopes.map((s) => s.scopeValue.toLowerCase());
      const demoDayHost = demoDay.host.toLowerCase();

      const canManageByHost = allowedHosts.includes(demoDayHost);

      if (canManageByHost) {
        return { participantUid: member.uid, isAdmin: true };
      }
    }

    // 3) Participant-level demo day admin (existing behavior based on DemoDayParticipant)
    const hasViewOnlyAdminAccess = await this.isDemoDayAdmin(member.uid, demoDayUid);
    if (hasViewOnlyAdminAccess) {
      return { participantUid: member.uid, isAdmin: true };
    }

    // 4) Regular participant access
    const participantAccess = await this.prisma.member.findUnique({
      where: { uid: member.uid },
      select: {
        demoDayParticipants: {
          where: {
            demoDayUid: demoDayUid,
            isDeleted: false,
            status: 'ENABLED',
          },
          select: { uid: true },
          take: 1,
        },
      },
    });

    if (participantAccess && participantAccess.demoDayParticipants.length > 0) {
      return { participantUid: member.uid, isAdmin: false };
    }

    // 5) No access
    throw new ForbiddenException('No demo day access');
  }

  // Private helper methods

  private async getQualifiedInvestorsCount(): Promise<number> {
    return this.prisma.member.count({
      where: {
        AND: [
          {
            accessLevel: {
              in: ['L5', 'L6'],
            },
          },
          {
            OR: [
              {
                investorProfile: {
                  secRulesAccepted: true,
                },
              },
              {
                investorProfile: {
                  type: { not: null },
                },
              },
            ],
          },
          {
            OR: [
              {
                investorProfile: {
                  OR: [{ type: { not: 'FUND' } }, { type: { equals: null } }],
                },
              },
              {
                AND: [
                  {
                    investorProfile: {
                      type: 'FUND',
                    },
                  },
                  {
                    teamMemberRoles: {
                      some: {
                        investmentTeam: true,
                        team: {
                          isFund: true,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
          {
            OR: [
              {
                investorProfile: {
                  OR: [{ type: { not: 'ANGEL' } }, { type: { equals: null } }],
                },
              },
              {
                AND: [
                  {
                    investorProfile: {
                      type: 'ANGEL',
                    },
                  },
                  {
                    investorProfile: {
                      OR: [
                        {
                          investInStartupStages: { isEmpty: false },
                        },
                        {
                          typicalCheckSize: { not: null, gt: 0 },
                        },
                        {
                          investmentFocus: { isEmpty: false },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
          {
            OR: [
              {
                investorProfile: {
                  OR: [{ type: { not: 'ANGEL_AND_FUND' } }, { type: { equals: null } }],
                },
              },
              {
                AND: [
                  {
                    investorProfile: {
                      type: 'ANGEL_AND_FUND',
                    },
                  },
                  {
                    OR: [
                      {
                        teamMemberRoles: {
                          some: {
                            investmentTeam: true,
                            team: {
                              isFund: true,
                            },
                          },
                        },
                      },
                      {
                        investorProfile: {
                          OR: [
                            {
                              investInStartupStages: { isEmpty: false },
                            },
                            {
                              typicalCheckSize: { not: null, gt: 0 },
                            },
                            {
                              investmentFocus: { isEmpty: false },
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  }

  private async getTeamsCountForDemoDay(demoDayUid: string): Promise<number> {
    return this.prisma.teamFundraisingProfile.count({
      where: {
        demoDayUid,
        status: 'PUBLISHED',
        onePagerUploadUid: { not: null },
        videoUploadUid: { not: null },
        team: {
          demoDayParticipants: {
            some: {
              demoDayUid,
              isDeleted: false,
              status: 'ENABLED',
              type: 'FOUNDER',
            },
          },
        },
      },
    });
  }

  private async getMemberWithDemoDayParticipants(memberEmail: string, demoDayUid?: string) {
    return this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: {
        uid: true,
        accessLevel: true,
        memberRoles: {
          select: {
            name: true,
          },
        },
        demoDayAdminScopes: {
          where: {
            scopeType: 'HOST',
          },
          select: {
            scopeValue: true,
          },
        },
        demoDayParticipants: {
          where: demoDayUid
            ? {
              demoDayUid,
              isDeleted: false,
            }
            : {
              isDeleted: false,
            },
          select: {
            uid: true,
            demoDayUid: true,
            status: true,
            type: true,
            isDemoDayAdmin: true,
            hasEarlyAccess: true,
            confidentialityAccepted: true,
          },
        },
      },
    });
  }

  /**
   * Check if a member has demo day admin access for a specific demo day.
   * A member has demo day admin access if they:
   * - Are a directory admin (DIRECTORY_ADMIN), OR
   * - Have the DEMO_DAY_ADMIN role AND their MemberDemoDayAdminScope.scopeValue matches the DemoDay.host
   *
   * Note: Participant-level isDemoDayAdmin is checked separately in getDemoDayAccess
   *
   * @param member - Member with roles and demoDayAdminScopes
   * @param demoDayHost - The host of the demo day to check access for
   */
  private hasDemoDayAdminAccess(
    member: MemberWithRoles & { demoDayAdminScopes?: { scopeValue: string }[] },
    demoDayHost?: string
  ): boolean {
    // Directory admins always have access
    if (isDirectoryAdmin(member)) {
      return true;
    }

    // Check if member has DEMO_DAY_ADMIN role
    if (!hasDemoDayAdminRole(member)) {
      return false;
    }

    // If no host provided, or no scopes defined, deny access for DEMO_DAY_ADMIN
    if (!demoDayHost || !member.demoDayAdminScopes || member.demoDayAdminScopes.length === 0) {
      return false;
    }

    // Check if member's scopes include the demo day host (case-insensitive)
    if (hasDemoDayAdminRole(member)) {
      const allowedHosts = member.demoDayAdminScopes.map((s) => s.scopeValue.toLowerCase());
      return allowedHosts.includes(demoDayHost.toLowerCase());
    }

    return false;
  }

  /**
   * Check if a member has admin access to a demo day
   * @param memberUid - UID of the member
   * @param demoDayUid - UID of the demo day
   * @returns True if the member has admin access
   */
  private async isDemoDayAdmin(memberUid: string, demoDayUid: string): Promise<boolean> {
    const participant = await this.prisma.demoDayParticipant.findFirst({
      where: {
        demoDayUid: demoDayUid,
        memberUid: memberUid,
        status: 'ENABLED',
        isDeleted: false,
      },
    });

    return participant?.isDemoDayAdmin || false;
  }

  /**
   * Preview what notification would be sent if the demo day is updated.
   * Returns { willSend: false, reason } if no notification would be sent.
   * Returns { willSend: true, title, description } if a notification would be sent.
   */
  async previewStatusNotification(
    demoDayUidOrSlug: string,
    newStatus: DemoDayStatus,
    newNotificationsEnabled: boolean
  ): Promise<{ willSend: boolean; title?: string; description?: string; reason?: string }> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: {
        OR: [{ uid: demoDayUidOrSlug }, { slugURL: demoDayUidOrSlug }],
        isDeleted: false,
      },
      select: {
        uid: true,
        title: true,
        slugURL: true,
        status: true,
        notificationsEnabled: true,
        startDate: true,
      },
    });

    if (!demoDay) {
      return { willSend: false, reason: 'Demo day not found' };
    }

    // Determine effective values after the update
    const effectiveStatus = newStatus || demoDay.status;
    const effectiveNotificationsEnabled = newNotificationsEnabled ?? demoDay.notificationsEnabled;

    // Check eligibility
    const eligibility = await this.checkNotificationEligibility(
      demoDay.uid,
      effectiveStatus,
      effectiveNotificationsEnabled,
      {
        currentStatus: demoDay.status,
        currentNotificationsEnabled: demoDay.notificationsEnabled,
      }
    );

    if (!eligibility.eligible) {
      return { willSend: false, reason: eligibility.reason };
    }

    // Get the notification content
    const content = this.getDemoDayNotificationContent({
      title: demoDay.title,
      status: effectiveStatus,
      startDate: demoDay.startDate,
    });

    return {
      willSend: true,
      title: content.title,
      description: content.description,
    };
  }

  /**
   * Check if a notification should be sent for a demo day status.
   */
  private async checkNotificationEligibility(
    demoDayUid: string,
    status: DemoDayStatus,
    notificationsEnabled: boolean,
    previous?: { currentStatus: DemoDayStatus; currentNotificationsEnabled: boolean }
  ): Promise<{ eligible: boolean; reason?: string }> {
    if (!notificationsEnabled) {
      return { eligible: false, reason: 'Notifications are disabled' };
    }

    if (!NOTIFIABLE_STATUSES.includes(status)) {
      return { eligible: false, reason: `Status "${status}" does not trigger notifications` };
    }

    // If we have previous state, check if there's an actual change that triggers notification
    if (previous) {
      const isStatusChanging = status !== previous.currentStatus;
      const isEnablingNotifications = notificationsEnabled && !previous.currentNotificationsEnabled;

      if (!isStatusChanging && !isEnablingNotifications) {
        return { eligible: false, reason: 'No changes that trigger notifications' };
      }
    }

    // Check if notification was already sent for this status
    const alreadySent = await this.hasNotificationBeenSent(demoDayUid, status);
    if (alreadySent) {
      return { eligible: false, reason: `Notification for "${status}" was already sent` };
    }

    return { eligible: true };
  }

  /**
   * Check if a notification has been sent for a demo day and status.
   */
  private async hasNotificationBeenSent(demoDayUid: string, status: DemoDayStatus): Promise<boolean> {
    const notification = await this.prisma.pushNotification.findFirst({
      where: {
        category: PushNotificationCategory.DEMO_DAY_ANNOUNCEMENT,
        isPublic: true,
        metadata: {
          path: ['demoDayUid'],
          equals: demoDayUid,
        },
        AND: {
          metadata: {
            path: ['status'],
            equals: status,
          },
        },
      },
    });
    return !!notification;
  }

  /**
   * Send Demo Day announcement notification.
   * Uses checkNotificationEligibility to determine if notification should be sent.
   */
  private async sendDemoDayStatusNotification(demoDay: {
    uid: string;
    title: string;
    slugURL: string;
    status: DemoDayStatus;
    notificationsEnabled: boolean;
    startDate: Date;
  }): Promise<void> {
    const eligibility = await this.checkNotificationEligibility(
      demoDay.uid,
      demoDay.status,
      demoDay.notificationsEnabled
    );

    if (!eligibility.eligible) {
      this.logger.log(`Skipping notification for Demo Day ${demoDay.uid}: ${eligibility.reason}`);
      return;
    }

    // Build and send notification
    const content = this.getDemoDayNotificationContent(demoDay);

    try {
      await this.pushNotificationsService.create({
        category: PushNotificationCategory.DEMO_DAY_ANNOUNCEMENT,
        title: content.title,
        description: content.description,
        link: `demoday/${demoDay.slugURL}`,
        metadata: {
          demoDayUid: demoDay.uid,
          demoDayTitle: demoDay.title,
          status: demoDay.status,
        },
        isPublic: true,
      });

      this.logger.debug(`Demo Day notification sent for ${demoDay.uid} status ${demoDay.status}`);
    } catch (error) {
      this.logger.error(`Failed to send Demo Day notification: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get notification title and description based on Demo Day status.
   */
  private getDemoDayNotificationContent(demoDay: { title: string; status: DemoDayStatus; startDate: Date }): {
    title: string;
    description: string;
  } {
    const formattedDate = demoDay.startDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    switch (demoDay.status) {
      case DemoDayStatus.UPCOMING:
        return {
          title: `${demoDay.title}`,
          description: `Upcoming: ${demoDay.title} starts ${formattedDate}`,
        };

      case DemoDayStatus.REGISTRATION_OPEN:
        return {
          title: `${demoDay.title}`,
          description: `Registration is now open for ${demoDay.title}!`,
        };

      case DemoDayStatus.EARLY_ACCESS:
        return {
          title: `${demoDay.title}`,
          description: `Open now: You have early access to ${demoDay.title}!`,
        };

      case DemoDayStatus.ACTIVE:
        return {
          title: `${demoDay.title}`,
          description: `${demoDay.title} is now live!`,
        };

      default:
        return {
          title: `${demoDay.title}`,
          description: `${demoDay.title} has been updated.`,
        };
    }
  }

  private buildAdminDemoDayLink(demoDaySlugURL: string): string | null {
    const base = process.env.WEB_ADMIN_UI_BASE_URL?.replace(/\/+$/, '');
    if (!base) return null;

    return `${base}/demo-days/${encodeURIComponent(demoDaySlugURL)}`;
  }

  // Dashboard Whitelist methods

  /**
   * Get all whitelisted members for a demo day's founder dashboard
   */
  async getDashboardWhitelist(demoDayUid: string) {
    // Get demo day to retrieve host
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUid);

    // Query MemberDemoDayAdminScope WHERE scopeType='DASHBOARD_WHITELIST' AND scopeValue=demoDay.host
    const whitelistScopes = await this.prisma.memberDemoDayAdminScope.findMany({
      where: {
        scopeType: 'DASHBOARD_WHITELIST',
        scopeValue: demoDay.host,
      },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
            image: {
              select: {
                url: true,
              },
            },
            teamMemberRoles: {
              where: {
                mainTeam: true,
              },
              select: {
                team: {
                  select: {
                    name: true,
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    });

    // Get demo day participants to check participant type/status
    const memberUids = whitelistScopes.map((scope) => scope.memberUid);
    const participants = await this.prisma.demoDayParticipant.findMany({
      where: {
        demoDayUid,
        memberUid: { in: memberUids },
        isDeleted: false,
      },
      select: {
        memberUid: true,
        type: true,
        status: true,
      },
    });

    const participantMap = new Map(participants.map((p) => [p.memberUid, p]));

    return whitelistScopes.map((scope) => {
      const participant = participantMap.get(scope.memberUid);
      const teamName = scope.member.teamMemberRoles[0]?.team?.name || null;

      return {
        memberUid: scope.memberUid,
        member: {
          uid: scope.member.uid,
          name: scope.member.name,
          email: scope.member.email || '',
          imageUrl: scope.member.image?.url || null,
        },
        participantType: (participant?.type || 'NONE') as 'INVESTOR' | 'FOUNDER' | 'SUPPORT' | 'NONE',
        participantStatus: (participant?.status || 'NONE') as 'PENDING' | 'INVITED' | 'ENABLED' | 'DISABLED' | 'NONE',
        teamName,
      };
    });
  }

  /**
   * Add a member to the dashboard whitelist for a demo day
   */
  async addToDashboardWhitelist(demoDayUid: string, memberUid: string) {
    // Get demo day to retrieve host
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUid);

    // Verify member exists
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException(`Member with uid ${memberUid} not found`);
    }

    // Check if already whitelisted (using host as scopeValue)
    const existing = await this.prisma.memberDemoDayAdminScope.findFirst({
      where: {
        memberUid,
        scopeType: 'DASHBOARD_WHITELIST',
        scopeValue: demoDay.host,
      },
    });

    if (existing) {
      throw new ConflictException('Member is already whitelisted for this demo day');
    }

    // Create the whitelist scope using host as scopeValue
    await this.prisma.memberDemoDayAdminScope.create({
      data: {
        memberUid,
        scopeType: 'DASHBOARD_WHITELIST',
        scopeValue: demoDay.host,
      },
    });

    return { success: true };
  }

  /**
   * Remove a member from the dashboard whitelist for a demo day
   */
  async removeFromDashboardWhitelist(demoDayUid: string, memberUid: string) {
    // Get demo day to retrieve host
    const demoDay = await this.getDemoDayByUidOrSlug(demoDayUid);

    // Find the whitelist scope using host as scopeValue
    const scope = await this.prisma.memberDemoDayAdminScope.findFirst({
      where: {
        memberUid,
        scopeType: 'DASHBOARD_WHITELIST',
        scopeValue: demoDay.host,
      },
    });

    if (!scope) {
      throw new NotFoundException('Member is not whitelisted for this demo day');
    }

    // Delete the scope
    await this.prisma.memberDemoDayAdminScope.delete({
      where: { id: scope.id },
    });

    return { success: true };
  }

  private async sendTelegramNewDemoDayApplicationAlert(args: {
    demoDay: { uid: string; slugURL: string; title: string; host?: string | null };
    applicationStartDate: Date;
    participantUid: string;
    memberUid: string;
    applicantName: string | null;
    applicantEmail: string;
    teamName?: string | null;
    teamUid?: string | null;
  }): Promise<void> {
    const adminLink = this.buildAdminDemoDayLink(args.demoDay.slugURL);

    const { channelType, applicationDate } = resolveChannelTypeAndApplicationDate({
      host: args.demoDay.host,
      applicationStartDate: args.applicationStartDate,
    });

    this.logger.log(
      `demoDayApplication: channel=${channelType}, host="${args.demoDay.host ?? ''}", applicationDate=${applicationDate}`
    );

    try {
      await this.notificationServiceClient.sendTelegramOutboxMessage({
        channelType,
        text: [
          '🔔 New Demo Day Application',
          `Application Date: ${applicationDate}`,
          `Host: ${args.demoDay.host ?? '-'}`,
          `Name: ${args.applicantName ?? '-'}`,
          `Email: ${args.applicantEmail ?? '-'}`,
          `Team: ${args.teamName ?? '-'}`,
          adminLink ? `Open in Admin: ${adminLink}` : 'Open in Admin: -',
        ].join('\n'),
        meta: {
          source: 'demo-day-application',
          demoDayUid: args.demoDay.uid,
          demoDaySlugURL: args.demoDay.slugURL,
          demoDayTitle: args.demoDay.title,
          demoDayHost: args.demoDay.host ?? null,
          applicationStartDate: args.applicationStartDate.toISOString(),
          applicationDate,
          participantUid: args.participantUid,
          memberUid: args.memberUid,
          name: args.applicantName,
          email: args.applicantEmail,
          teamUid: args.teamUid ?? null,
          teamName: args.teamName ?? null,
          adminLink,
          channelType,
        },
      });
    } catch (e) {
      this.logger.warn(
        `Failed to send Telegram alert for demo-day application. demoDayUid=${args.demoDay.uid}, participantUid=${args.participantUid}. ` +
        (e instanceof Error ? e.message : String(e))
      );
    }
  }
}
