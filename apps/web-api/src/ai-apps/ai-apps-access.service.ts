import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiApp, AiAppAccess } from '@prisma/client';
import { AiAppTargetEnvironment } from './ai-apps.constants';
import { PrismaService } from '../shared/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { memberHasAnyPermission } from '../rbac/rbac-permission-check';
import { AiAppsService } from './ai-apps.service';
import { AI_APPS_ACCESS_CANDIDATES_LIMIT } from './ai-apps.constants';
import { assertValidPublicPaths, matchesPublicPath, samePublicPaths } from './ai-apps-public-paths';
import { UpdateAiAppAccessDto, UpdateAiAppPublicPathsDto } from './dto/ai-app-access.dto';

/** One whitelisted member as shown in the Manage access modal. */
export interface AiAppAllowedMemberInfo {
  uid: string;
  name: string;
  image: string | null;
  addedAt: Date;
}

export interface AiAppAccessSettings {
  access: AiAppAccess;
  /** False while the app still runs a sidecar that predates per-app decisions (see `AiApp.directLinkGateReady`). */
  directLinkGateReady: boolean;
  members: AiAppAllowedMemberInfo[];
  /** Present on the top-level response only. Preview does not follow production access. */
  preview?: Omit<AiAppAccessSettings, 'preview'>;
}

export interface AiAppAccessCandidate {
  uid: string;
  name: string;
  image: string | null;
  teamName: string | null;
  /** Members without AI Apps access can never open the app, so the picker disables them. */
  hasAiAppsAccess: boolean;
  alreadyAdded: boolean;
}

export interface AiAppPublicPathsSettings {
  publicPaths: string[];
  /** False while the app still runs a sidecar that doesn't forward the request path (see `AiApp.publicPathsGateReady`). */
  publicPathsGateReady: boolean;
}

export type AiAppAccessCheckResult = { allowed: true; reason?: 'untracked' | 'public' };

/** The app row the sidecar decision needs, fetched once per `access-check` request. */
export type AiAppAccessCheckApp = Pick<AiApp, 'uid' | 'memberUid' | 'access' | 'publicPaths' | 'previewAccess'>;

/** Either permission grants AI Apps visibility — the same `anyOf` the dashboard routes use. */
const READ_PERMISSIONS = [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE];
const WRITE_PERMISSIONS = [AI_APPS_PERMISSIONS.WRITE];

/**
 * Per-app access: the owner/admin-managed mode + whitelist, the member search
 * that feeds it, and the decision endpoint a deployed app's auth sidecar asks
 * on every request. The visibility rule itself lives in
 * `AiAppsService.canViewApp` so the catalog, detail reads, and the sidecar all
 * share it.
 */
@Injectable()
export class AiAppsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAppsService: AiAppsService,
    private readonly rbacService: RbacService,
    private readonly accessControlV2Service: AccessControlV2Service
  ) {}

  async getAccess(requesterUid: string, uid: string): Promise<AiAppAccessSettings> {
    const app = await this.findManageableApp(requesterUid, uid);
    const [prod, preview] = await Promise.all([this.toSettings(app, 'prod'), this.toSettings(app, 'preview')]);
    return { ...prod, preview };
  }

  /**
   * Replaces the app's access mode and whole whitelist atomically. The owner is
   * dropped from the list (they always have access); every other uid must be a
   * member holding AI Apps access, or nothing is saved. A deployed app switched
   * to OPEN for the first time gets its one-time "new AI App" broadcast; newly
   * whitelisted members of a deployed PRIVATE app get a "shared with you"
   * notification.
   */
  async updateAccess(requesterUid: string, uid: string, dto: UpdateAiAppAccessDto): Promise<AiAppAccessSettings> {
    const app = await this.findManageableApp(requesterUid, uid);
    const environment: AiAppTargetEnvironment = dto.environment === 'preview' ? 'preview' : 'prod';
    const memberUids = Array.from(new Set(dto.memberUids)).filter((memberUid) => memberUid !== app.memberUid);
    await this.assertWhitelistable(memberUids);

    const existing = await this.prisma.aiAppAllowedMember.findMany({
      where: { appUid: app.uid, environment },
      select: { memberUid: true },
    });
    const existingUids = new Set(existing.map((row) => row.memberUid));
    const nextUids = new Set(memberUids);
    const removed = [...existingUids].filter((memberUid) => !nextUids.has(memberUid));
    const added = memberUids.filter((memberUid) => !existingUids.has(memberUid));

    const [updated] = await this.prisma.$transaction([
      this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: environment === 'preview' ? { previewAccess: dto.access } : { access: dto.access },
      }),
      this.prisma.aiAppAllowedMember.deleteMany({
        where: { appUid: app.uid, environment, memberUid: { in: removed } },
      }),
      this.prisma.aiAppAllowedMember.createMany({
        data: added.map((memberUid) => ({
          appUid: app.uid,
          environment,
          memberUid,
          addedByUid: requesterUid,
          // Saved while OPEN: the open broadcast covers them, so a later
          // switch to PRIVATE must not ping them as newly shared.
          notifiedAt: dto.access === 'OPEN' ? new Date() : null,
        })),
        skipDuplicates: true,
      }),
    ]);

    if (environment === 'prod') {
      await this.aiAppsService.announceIfEligible(updated);
    }
    await this.aiAppsService.notifyAllowedMembers(updated, environment);
    return this.getAccess(requesterUid, uid);
  }

  /**
   * Member name search for the whitelist picker, flagged with AI Apps access and current membership.
   * The result cap applies only to members who hold AI Apps access. Filtering after `take` hid
   * them whenever earlier name matches (e.g. every other "Chris") filled the page.
   */
  async searchCandidates(
    requesterUid: string,
    uid: string,
    search: string,
    environment: AiAppTargetEnvironment = 'prod'
  ): Promise<AiAppAccessCandidate[]> {
    const app = await this.findManageableApp(requesterUid, uid);
    const members = await this.prisma.member.findMany({
      where: {
        name: { contains: search, mode: 'insensitive' },
        deletedAt: null,
        uid: { not: app.memberUid },
        OR: aiAppsAccessMemberFilter(),
      },
      select: {
        uid: true,
        name: true,
        image: { select: { url: true } },
        teamMemberRoles: {
          select: { team: { select: { name: true } } },
          orderBy: { mainTeam: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
      take: AI_APPS_ACCESS_CANDIDATES_LIMIT,
    });
    if (!members.length) {
      return [];
    }
    const added = await this.prisma.aiAppAllowedMember.findMany({
      where: { appUid: app.uid, environment, memberUid: { in: members.map((member) => member.uid) } },
      select: { memberUid: true },
    });
    const addedUids = new Set(added.map((row) => row.memberUid));
    const access = await Promise.all(members.map((member) => this.hasAiAppsAccess(member.uid)));
    return members.map((member, index) => ({
      uid: member.uid,
      name: member.name,
      image: member.image?.url ?? null,
      teamName: member.teamMemberRoles[0]?.team?.name ?? null,
      hasAiAppsAccess: access[index],
      alreadyAdded: addedUids.has(member.uid),
    }));
  }

  /**
   * Decision for a deployed app's auth sidecar: the PL Infra permission the
   * request method needs (GET/HEAD → read or write, anything else → write),
   * then the app's visibility rule. An appId the Directory doesn't track keeps
   * the permission-only behavior sidecars had before per-app access existed.
   */
  async getPublicPaths(requesterUid: string, uid: string): Promise<AiAppPublicPathsSettings> {
    const app = await this.findManageableApp(requesterUid, uid, 'public endpoints');
    return toPublicPathsSettings(app);
  }

  /**
   * Replaces the app's public path patterns (validated as a whole — one bad
   * pattern saves nothing). A real change is audited as
   * `PUBLIC_PATHS_UPDATED`; saving the stored list again is a no-op.
   */
  async updatePublicPaths(
    requesterUid: string,
    uid: string,
    dto: UpdateAiAppPublicPathsDto
  ): Promise<AiAppPublicPathsSettings> {
    const app = await this.findManageableApp(requesterUid, uid, 'public endpoints');
    const publicPaths = assertValidPublicPaths(dto.publicPaths);
    if (samePublicPaths(app.publicPaths, publicPaths)) {
      return toPublicPathsSettings(app);
    }
    const updated = await this.prisma.aiApp.update({ where: { uid: app.uid }, data: { publicPaths } });
    await this.aiAppsService.recordPublicPathsUpdated(requesterUid, updated);
    return toPublicPathsSettings(updated);
  }

  /** The non-DELETED app holding `appId` (a global claim, so at most one), with the fields the sidecar decision needs. */
  findAppForAccessCheck(appId: string): Promise<AiAppAccessCheckApp | null> {
    return this.prisma.aiApp.findFirst({
      where: { appId, status: { not: 'DELETED' } },
      select: { uid: true, memberUid: true, access: true, publicPaths: true, previewAccess: true },
    });
  }

  /** True when the request path is one of the app's public patterns — decided before any auth. */
  isPublicPath(app: AiAppAccessCheckApp | null, path: string | undefined): boolean {
    return !!app && matchesPublicPath(app.publicPaths, path);
  }

  async checkAccess(
    requesterUid: string,
    appId: string,
    method: string,
    prefetched?: { app: AiAppAccessCheckApp | null },
    target: AiAppTargetEnvironment = 'prod'
  ): Promise<AiAppAccessCheckResult> {
    const readOnly = ['GET', 'HEAD'].includes(method.toUpperCase());
    const hasPermission = await memberHasAnyPermission(
      this.rbacService,
      this.accessControlV2Service,
      requesterUid,
      readOnly ? READ_PERMISSIONS : WRITE_PERMISSIONS
    );
    if (!hasPermission) {
      throw new ForbiddenException({ allowed: false, reason: 'permission' });
    }
    const app = prefetched ? prefetched.app : await this.findAppForAccessCheck(appId);
    if (!app) {
      return { allowed: true, reason: 'untracked' };
    }
    const allowed =
      target === 'preview'
        ? await this.aiAppsService.canViewPreview(requesterUid, app)
        : await this.aiAppsService.canViewApp(requesterUid, app);
    if (!allowed) {
      throw new ForbiddenException({ allowed: false, reason: 'private' });
    }
    return { allowed: true };
  }

  private async findManageableApp(requesterUid: string, uid: string, setting = 'access'): Promise<AiApp> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.aiAppsService.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException(`Only the app creator or a directory admin can manage ${setting}`);
    }
    return app;
  }

  private async assertWhitelistable(memberUids: string[]): Promise<void> {
    if (!memberUids.length) {
      return;
    }
    const found = await this.prisma.member.findMany({
      where: { uid: { in: memberUids }, deletedAt: null },
      select: { uid: true },
    });
    const foundUids = new Set(found.map((member) => member.uid));
    const unknown = memberUids.filter((memberUid) => !foundUids.has(memberUid));
    const known = memberUids.filter((memberUid) => foundUids.has(memberUid));
    const access = await Promise.all(known.map((memberUid) => this.hasAiAppsAccess(memberUid)));
    const withoutAccess = known.filter((_, index) => !access[index]);
    if (unknown.length || withoutAccess.length) {
      throw new BadRequestException({
        message: 'Some members cannot be added to this app',
        unknownMemberUids: unknown,
        membersWithoutAiAppsAccess: withoutAccess,
      });
    }
  }

  private async previewGateReady(appUid: string): Promise<boolean> {
    const table = (this.prisma as any).aiAppTarget;
    if (!table?.findUnique) return false;
    const row = await table.findUnique({
      where: { appUid_environment: { appUid, environment: 'preview' } },
      select: { directLinkGateReady: true },
    });
    return !!row?.directLinkGateReady;
  }

  private hasAiAppsAccess(memberUid: string): Promise<boolean> {
    return memberHasAnyPermission(this.rbacService, this.accessControlV2Service, memberUid, READ_PERMISSIONS);
  }

  private async toSettings(app: AiApp, environment: AiAppTargetEnvironment): Promise<AiAppAccessSettings> {
    const rows = await this.prisma.aiAppAllowedMember.findMany({
      where: { appUid: app.uid, environment },
      orderBy: { createdAt: 'asc' },
    });
    const members = rows.length
      ? await this.prisma.member.findMany({
          where: { uid: { in: rows.map((row) => row.memberUid) } },
          select: { uid: true, name: true, image: { select: { url: true } } },
        })
      : [];
    const byUid = new Map(members.map((member) => [member.uid, member]));
    const directLinkGateReady =
      environment === 'preview' ? await this.previewGateReady(app.uid) : app.directLinkGateReady;
    return {
      access: environment === 'preview' ? (app.previewAccess ?? 'PRIVATE') : app.access,
      directLinkGateReady,
      members: rows.flatMap((row) => {
        const member = byUid.get(row.memberUid);
        return member
          ? [{ uid: member.uid, name: member.name, image: member.image?.url ?? null, addedAt: row.createdAt }]
          : [];
      }),
    };
  }
}

function toPublicPathsSettings(app: AiApp): AiAppPublicPathsSettings {
  return { publicPaths: app.publicPaths ?? [], publicPathsGateReady: app.publicPathsGateReady };
}

/** Same grants `hasAiAppsAccess` accepts: v2 policy or direct, or an active v1 role or direct grant. */
function aiAppsAccessMemberFilter() {
  const permission = { code: { in: [...READ_PERMISSIONS] } };
  return [
    { policyAssignmentsV2: { some: { policy: { policyPermissions: { some: { permission } } } } } },
    { memberPermissionsV2: { some: { permission } } },
    {
      roleAssignments: {
        some: {
          status: 'ACTIVE',
          revokedAt: null,
          role: { rolePermissions: { some: { permission } } },
        },
      },
    },
    { memberPermissions: { some: { status: 'ACTIVE', revokedAt: null, permission } } },
  ];
}
