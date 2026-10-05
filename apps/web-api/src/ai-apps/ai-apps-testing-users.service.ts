import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AiApp, AiAppTestingUser, Prisma } from '@prisma/client';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PrismaService } from '../shared/prisma.service';
import { AiAppsService } from './ai-apps.service';
import { AiAppsSessionService } from './ai-apps-session.service';
import {
  AI_APPS_TESTING_SESSION_MINTED,
  AI_APPS_TESTING_SESSION_USED,
  AI_APPS_TESTING_USER_CREATED,
  AI_APPS_TESTING_USER_REVOKED,
  AI_APPS_TESTING_USERS_MAX_PER_APP,
  AI_APPS_TESTING_USERS_PAGE_LIMIT,
  AiAppTargetEnvironment,
} from './ai-apps.constants';

/** One testing user as returned to the app's creator or a directory admin. */
export interface AiAppTestingUserView {
  uid: string;
  name: string;
  createdAt: Date;
  /** Null while the testing user is active. */
  revokedAt: Date | null;
}

export interface AiAppTestingUserList {
  page: number;
  limit: number;
  total: number;
  items: AiAppTestingUserView[];
}

/**
 * Preview testing users (LAB-2743): name-only identities an app's creator or a
 * directory admin creates for load tests on the app's Preview. They live in
 * their own table and never get a Member row, so member lists, search, digests
 * and exports never see them. Preview sessions (LAB-2744) are minted here;
 * the access check reads `revokedAt` through `findLive`.
 */
@Injectable()
export class AiAppsTestingUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAppsService: AiAppsService,
    private readonly sessionService: AiAppsSessionService,
    private readonly analyticsService: AnalyticsService
  ) {}

  /**
   * Creates `count` testing users, all or nothing. Refused when the app has no
   * Preview environment or when the app would pass the cap of active users.
   * Names continue from the highest number the app has used, so they are never
   * reused; two concurrent creates compute the same numbers and the second hits
   * the (appUid, number) unique index (409).
   */
  async create(requesterUid: string, appUid: string, count: number): Promise<{ items: AiAppTestingUserView[] }> {
    if (!Number.isInteger(count) || count < 1 || count > AI_APPS_TESTING_USERS_MAX_PER_APP) {
      throw new BadRequestException(`count must be a whole number from 1 to ${AI_APPS_TESTING_USERS_MAX_PER_APP}`);
    }
    const app = await this.findManageableApp(requesterUid, appUid);
    await this.assertHasPreview(app);

    let created: AiAppTestingUser[];
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const active = await tx.aiAppTestingUser.count({ where: { appUid: app.uid, revokedAt: null } });
        const remaining = AI_APPS_TESTING_USERS_MAX_PER_APP - active;
        if (count > remaining) {
          throw new BadRequestException(
            remaining > 0
              ? `An app can have at most ${AI_APPS_TESTING_USERS_MAX_PER_APP} active testing users; you can create ${remaining} more`
              : `An app can have at most ${AI_APPS_TESTING_USERS_MAX_PER_APP} active testing users; revoke one to create another`
          );
        }
        const { _max } = await tx.aiAppTestingUser.aggregate({ where: { appUid: app.uid }, _max: { number: true } });
        const first = (_max.number ?? 0) + 1;
        await tx.aiAppTestingUser.createMany({
          data: Array.from({ length: count }, (_, index) => ({
            appUid: app.uid,
            number: first + index,
            name: `Testing user ${first + index}`,
            createdByUid: requesterUid,
          })),
        });
        return tx.aiAppTestingUser.findMany({
          where: { appUid: app.uid, number: { gte: first } },
          orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Another request is creating testing users for this app; try again');
      }
      throw error;
    }

    this.track(AI_APPS_TESTING_USER_CREATED, requesterUid, {
      appUid: app.uid,
      count: created.length,
      memberUid: requesterUid,
    });
    return { items: created.map(toView) };
  }

  /** Every testing user of the app, active and revoked, oldest first. */
  async list(
    requesterUid: string,
    appUid: string,
    query: { page?: number; limit?: number } = {}
  ): Promise<AiAppTestingUserList> {
    const app = await this.findManageableApp(requesterUid, appUid);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? AI_APPS_TESTING_USERS_PAGE_LIMIT, AI_APPS_TESTING_USERS_PAGE_LIMIT);
    const where = { appUid: app.uid };
    const [total, rows] = await Promise.all([
      this.prisma.aiAppTestingUser.count({ where }),
      this.prisma.aiAppTestingUser.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { page, limit, total, items: rows.map(toView) };
  }

  /**
   * Revokes one testing user: sets `revokedAt` (the row is kept) and ends any
   * app session held under its uid. Idempotent: an already revoked user keeps
   * its first `revokedAt` and fires no second event.
   */
  async revoke(
    requesterUid: string,
    appUid: string,
    testingUserUid: string
  ): Promise<{ uid: string; revoked: true; revokedAt: Date }> {
    const app = await this.findManageableApp(requesterUid, appUid);
    const existing = await this.prisma.aiAppTestingUser.findUnique({ where: { uid: testingUserUid } });
    if (!existing || existing.appUid !== app.uid) {
      throw new NotFoundException('Testing user not found');
    }
    if (existing.revokedAt) {
      // Ending sessions again is idempotent and covers a first revoke whose session step failed.
      await this.sessionService.revokeAllForMember(existing.uid);
      return { uid: existing.uid, revoked: true, revokedAt: existing.revokedAt };
    }

    const revokedAt = new Date();
    // Conditional update: a concurrent revoke that got there first keeps its time.
    const { count } = await this.prisma.aiAppTestingUser.updateMany({
      where: { uid: existing.uid, revokedAt: null },
      data: { revokedAt },
    });
    if (!count) {
      const current = await this.prisma.aiAppTestingUser.findUnique({ where: { uid: existing.uid } });
      return { uid: existing.uid, revoked: true, revokedAt: current?.revokedAt ?? revokedAt };
    }
    // No testing-user session can be minted before LAB-2744; this keeps "revoking ends its sessions" true after it.
    await this.sessionService.revokeAllForMember(existing.uid);
    this.track(AI_APPS_TESTING_USER_REVOKED, requesterUid, {
      appUid: app.uid,
      testingUserUid: existing.uid,
      memberUid: requesterUid,
    });
    return { uid: existing.uid, revoked: true, revokedAt };
  }

  /**
   * One token per active testing user, shown once. Omitted `uids` mints every active user of the app.
   * A uid that is revoked or belongs to another app refuses the whole request.
   */
  async mintSessions(
    requesterUid: string,
    appUid: string,
    uids?: string[]
  ): Promise<{ items: { uid: string; name: string; token: string; expiresAt: Date }[] }> {
    const app = await this.findManageableApp(requesterUid, appUid);
    await this.assertHasPreview(app);
    if (!app.appId) {
      throw new BadRequestException('This app has no app id');
    }
    const requested = uids ? [...new Set(uids)] : undefined;
    const active = await this.prisma.aiAppTestingUser.findMany({
      where: {
        appUid: app.uid,
        revokedAt: null,
        ...(requested ? { uid: { in: requested } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
    });
    if (requested && active.length !== requested.length) {
      throw new BadRequestException('One or more testing users are not active on this app');
    }
    const items: { uid: string; name: string; token: string; expiresAt: Date }[] = [];
    for (const user of active) {
      const grant = await this.sessionService.openTestingSession(user.uid, app.appId);
      items.push({ uid: user.uid, name: user.name, token: grant.token, expiresAt: grant.expiresAt });
    }
    if (items.length) {
      this.track(AI_APPS_TESTING_SESSION_MINTED, requesterUid, {
        appUid: app.uid,
        count: items.length,
        memberUid: requesterUid,
      });
    }
    return { items };
  }

  /**
   * Preview gate for a testing session that `validate` already accepted for this app. A missing row is 401
   * (revoked while the session row is still live); any target other than preview is 403, with no permission lookup.
   * The first allow records `ai-apps-testing-session-used`.
   */
  async authorizePreviewSession(params: {
    testingUserUid: string;
    appUid: string;
    target: AiAppTargetEnvironment;
    sessionUid: string;
    createdAt: Date;
  }): Promise<{ allowed: true }> {
    const live = await this.findLive(params.testingUserUid, params.appUid);
    if (!live) {
      throw new UnauthorizedException('Invalid or expired app session');
    }
    if (params.target !== 'preview') {
      throw new ForbiddenException({ allowed: false, reason: 'private' });
    }
    if (await this.sessionService.claimFirstUse(params.sessionUid, params.createdAt)) {
      this.track(AI_APPS_TESTING_SESSION_USED, `testing:${params.testingUserUid}`, {
        appUid: params.appUid,
        testingUserUid: params.testingUserUid,
        memberUid: params.testingUserUid,
      });
    }
    return { allowed: true };
  }

  /** The active testing user `uid` of app `appUid`, or null. For the Preview session check (LAB-2744). */
  findLive(uid: string, appUid: string): Promise<AiAppTestingUser | null> {
    return this.prisma.aiAppTestingUser.findFirst({ where: { uid, appUid, revokedAt: null } });
  }

  /** The active testing user `uid` whose app's `appId` matches, or null. */
  async findLiveForAppId(uid: string, appId: string): Promise<AiAppTestingUser | null> {
    const user = await this.prisma.aiAppTestingUser.findFirst({ where: { uid, revokedAt: null } });
    if (!user) return null;
    const app = await this.prisma.aiApp.findUnique({
      where: { uid: user.appUid },
      select: { appId: true, status: true },
    });
    if (!app || app.status === 'DELETED' || app.appId !== appId) return null;
    return user;
  }

  private async findManageableApp(requesterUid: string, appUid: string): Promise<AiApp> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid: appUid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${appUid}`);
    }
    if (!(await this.aiAppsService.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can manage testing users');
    }
    return app;
  }

  /**
   * An app has a Preview environment once its preview target was uploaded or deployed; the same test
   * `AiAppsService.deleteTarget` uses for "This environment is not deployed". Tearing the Preview down deletes the row.
   */
  private async assertHasPreview(app: AiApp): Promise<void> {
    const preview = await this.prisma.aiAppTarget.findUnique({
      where: { appUid_environment: { appUid: app.uid, environment: 'preview' } },
      select: { url: true, s3Key: true, lastDeployedAt: true },
    });
    if (!preview?.url && !preview?.s3Key && !preview?.lastDeployedAt) {
      throw new BadRequestException(
        'This app has no Preview environment; deploy a Preview before adding testing users'
      );
    }
  }

  private track(name: string, distinctId: string, properties: Record<string, unknown>): void {
    void this.analyticsService.trackEvent({ name, distinctId, properties });
  }
}

function toView(row: AiAppTestingUser): AiAppTestingUserView {
  return { uid: row.uid, name: row.name, createdAt: row.createdAt, revokedAt: row.revokedAt };
}
