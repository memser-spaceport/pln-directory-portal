import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AiApp, Prisma } from '@prisma/client';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { PrismaService } from '../shared/prisma.service';
import { buildAppUrl } from './ai-apps.constants';

/** A member an app is published to by name, as Back Office lists them. */
export interface AiAppAudienceMemberView {
  uid: string;
  name: string;
  email: string | null;
}

/** An app's audience and LabOS settings as Back Office shows and saves them. */
export interface AiAppAudienceSettings {
  appUid: string;
  appId: string;
  name: string;
  /** Policy codes the app is published to. */
  policyCodes: string[];
  /** Permission codes the app is published to (LAB-3236). */
  permissionCodes: string[];
  /** Members the app is published to by name (LAB-3236). Policies, permissions and members all empty = PL Infra only. */
  members: AiAppAudienceMemberView[];
  showInMore: boolean;
  path: string | null;
  iconUrl: string | null;
  hideTopNav: boolean;
  /** False while the app still runs a sidecar that predates per-app decisions; group members are refused until a redeploy. */
  directLinkGateReady: boolean;
}

/** What a directory admin saves. Absent fields stay as they are, so an older Back Office that sends only `policyCodes` keeps working. */
export interface AiAppAudienceUpdate {
  policyCodes: string[];
  permissionCodes?: string[];
  memberUids?: string[];
  showInMore?: boolean;
  path?: string | null;
  iconUrl?: string | null;
  hideTopNav?: boolean;
}

/** A published app as LabOS lists it for a member in its audience: under More when `showInMore`, and at `/apps/<path or uid>`. */
export interface PublishedAiApp {
  uid: string;
  appId: string;
  name: string;
  description: string | null;
  url: string;
  path: string | null;
  iconUrl: string | null;
  showInMore: boolean;
  hideTopNav: boolean;
}

type AudienceApp = Pick<AiApp, 'uid' | 'audiencePolicyCodes'> & Partial<Pick<AiApp, 'audiencePermissionCodes'>>;

/** Readable LabOS path: lowercase letters, digits and inner hyphens, 2–60 characters. */
const APP_PATH_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$/;
/** A path shaped like an app uid (cuid) could shadow another app's uid link. */
const CUID_PATTERN = /^c[a-z0-9]{24}$/;

/**
 * Publishing an app to members outside PL Infra (LAB-3200, LAB-3236). A directory admin sets policy codes,
 * permission codes and individual members on the app; an approved member who matches any of them may open the
 * production app without `ai_apps.read`/`write`. The audience never grants the AI Apps catalog, the preview target
 * or any management route. The same admin also sets how LabOS shows the app: under More or not, its path, its icon
 * and whether the LabOS top navigation shows.
 */
@Injectable()
export class AiAppsAudienceService {
  private readonly logger = new Logger(AiAppsAudienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly accessControlV2Service?: AccessControlV2Service
  ) {}

  /**
   * Whether the member is in the app's audience: approved, and holding one of its policies, holding one of its
   * permissions, or named on its member list. Read on every request, so a change applies at once.
   */
  async isInAudience(memberUid: string | undefined, app: AudienceApp | null | undefined): Promise<boolean> {
    if (!memberUid || !app) {
      return false;
    }
    if (!(await this.isApproved(memberUid))) {
      return false;
    }
    const policyCodes = app.audiencePolicyCodes ?? [];
    if (policyCodes.length) {
      const held = await this.prisma.policyAssignment.findFirst({
        where: { memberUid, policy: { code: { in: policyCodes } } },
        select: { uid: true },
      });
      if (held) {
        return true;
      }
    }
    const listed = await this.prisma.aiAppAudienceMember.findUnique({
      where: { appUid_memberUid: { appUid: app.uid, memberUid } },
      select: { memberUid: true },
    });
    if (listed) {
      return true;
    }
    const permissionCodes = app.audiencePermissionCodes ?? [];
    if (permissionCodes.length) {
      const effective = await this.effectivePermissions(memberUid);
      return permissionCodes.some((code) => effective.has(code));
    }
    return false;
  }

  /** {@link isInAudience} for the non-DELETED app holding `appId` (the auth gate names the app by appId). */
  async isInAudienceOfAppId(memberUid: string | undefined, appId: string | undefined): Promise<boolean> {
    if (!memberUid || !appId) {
      return false;
    }
    const app = await this.prisma.aiApp.findFirst({
      where: { appId, status: { not: 'DELETED' } },
      select: { uid: true, audiencePolicyCodes: true, audiencePermissionCodes: true },
    });
    return this.isInAudience(memberUid, app);
  }

  /**
   * Live apps published to the member, whether or not they show under More (LabOS filters the menu by
   * `showInMore` and opens the rest by link). Needs no AI Apps permission.
   */
  async listPublishedFor(memberUid: string): Promise<PublishedAiApp[]> {
    if (!(await this.isApproved(memberUid))) {
      return [];
    }
    const [assignments, listedRows, effective] = await Promise.all([
      this.prisma.policyAssignment.findMany({ where: { memberUid }, select: { policy: { select: { code: true } } } }),
      this.prisma.aiAppAudienceMember.findMany({ where: { memberUid }, select: { appUid: true } }),
      this.effectivePermissions(memberUid),
    ]);
    const policyCodes = assignments.map((assignment) => assignment.policy.code);
    const permissionCodes = Array.from(effective);
    const listedAppUids = listedRows.map((row) => row.appUid);
    const audienceMatch: Prisma.AiAppWhereInput[] = [
      ...(policyCodes.length ? [{ audiencePolicyCodes: { hasSome: policyCodes } }] : []),
      ...(permissionCodes.length ? [{ audiencePermissionCodes: { hasSome: permissionCodes } }] : []),
      ...(listedAppUids.length ? [{ uid: { in: listedAppUids } }] : []),
    ];
    if (!audienceMatch.length) {
      return [];
    }
    const apps = await this.prisma.aiApp.findMany({
      where: {
        status: { notIn: ['DELETED', 'DELETING'] },
        lastDeployedAt: { not: null },
        OR: audienceMatch,
      },
      select: {
        uid: true,
        appId: true,
        name: true,
        description: true,
        url: true,
        path: true,
        iconUrl: true,
        showInMore: true,
        hideTopNav: true,
      },
      orderBy: { name: 'asc' },
    });
    return apps.map((app) => ({
      uid: app.uid,
      appId: app.appId,
      name: app.name,
      description: app.description,
      url: app.url ?? buildAppUrl(app.appId, 'prod'),
      path: app.path,
      iconUrl: app.iconUrl,
      showInMore: app.showInMore,
      hideTopNav: app.hideTopNav,
    }));
  }

  async getAudience(appId: string): Promise<AiAppAudienceSettings> {
    return this.toSettings(await this.findApp(appId));
  }

  /**
   * Saves the app's audience and LabOS settings. Policy, permission and member lists replace the stored ones
   * (all empty = PL Infra only); every code and member must exist, and the path must be free, otherwise nothing is
   * saved. A real change is audited as `AUDIENCE_UPDATED`; saving the stored values again is a no-op.
   */
  async updateAudience(actorUid: string, appId: string, input: AiAppAudienceUpdate): Promise<AiAppAudienceSettings> {
    const app = await this.findApp(appId);
    const currentMemberUids = await this.memberUidsOf(app.uid);

    const policyCodes = normalizeList(input.policyCodes);
    const permissionCodes =
      input.permissionCodes === undefined ? sorted(app.audiencePermissionCodes) : normalizeList(input.permissionCodes);
    const memberUids = input.memberUids === undefined ? currentMemberUids : normalizeList(input.memberUids);
    const showInMore = input.showInMore ?? app.showInMore;
    const hideTopNav = input.hideTopNav ?? app.hideTopNav;
    const path = input.path === undefined ? app.path : normalizePath(input.path);
    const iconUrl = input.iconUrl === undefined ? app.iconUrl : normalizeIconUrl(input.iconUrl);

    await this.assertKnown('policy', policyCodes, (codes) =>
      this.prisma.policy
        .findMany({ where: { code: { in: codes } }, select: { code: true } })
        .then((rows) => rows.map((row) => row.code))
    );
    await this.assertKnown('permission', permissionCodes, (codes) =>
      this.prisma.permission
        .findMany({ where: { code: { in: codes } }, select: { code: true } })
        .then((rows) => rows.map((row) => row.code))
    );
    await this.assertKnown('member', memberUids, (uids) =>
      this.prisma.member
        .findMany({ where: { uid: { in: uids } }, select: { uid: true } })
        .then((rows) => rows.map((row) => row.uid))
    );
    if (path && path !== app.path) {
      await this.assertPathFree(path, app.uid);
    }

    const unchanged =
      sameList(sorted(app.audiencePolicyCodes), policyCodes) &&
      sameList(sorted(app.audiencePermissionCodes), permissionCodes) &&
      sameList(currentMemberUids, memberUids) &&
      showInMore === app.showInMore &&
      hideTopNav === app.hideTopNav &&
      path === app.path &&
      iconUrl === app.iconUrl;
    if (unchanged) {
      return this.toSettings(app);
    }

    const removed = currentMemberUids.filter((uid) => !memberUids.includes(uid));
    const added = memberUids.filter((uid) => !currentMemberUids.includes(uid));
    let updated: AiApp;
    try {
      [updated] = await this.prisma.$transaction([
        this.prisma.aiApp.update({
          where: { uid: app.uid },
          data: {
            audiencePolicyCodes: policyCodes,
            audiencePermissionCodes: permissionCodes,
            showInMore,
            hideTopNav,
            path,
            iconUrl,
          },
        }),
        this.prisma.aiAppAudienceMember.deleteMany({ where: { appUid: app.uid, memberUid: { in: removed } } }),
        this.prisma.aiAppAudienceMember.createMany({
          data: added.map((memberUid) => ({ appUid: app.uid, memberUid, addedByUid: actorUid })),
          skipDuplicates: true,
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw pathTaken(path);
      }
      throw error;
    }
    const settings = await this.toSettings(updated);
    await this.recordAudienceUpdated(actorUid, updated, settings);
    return settings;
  }

  /** Approval decides membership of every audience, whichever way the member is matched. */
  private async isApproved(memberUid: string): Promise<boolean> {
    const approval = await this.prisma.memberApproval.findUnique({ where: { memberUid }, select: { state: true } });
    return approval?.state === 'APPROVED';
  }

  /** Effective permission codes (policies plus direct grants), read through Access Control V2. */
  private async effectivePermissions(memberUid: string): Promise<Set<string>> {
    if (!this.accessControlV2Service) {
      return new Set();
    }
    try {
      const access = await this.accessControlV2Service.getMemberAccess(memberUid);
      return new Set(access.effectivePermissions ?? []);
    } catch (error) {
      this.logger.warn(`Effective permissions unavailable for ${memberUid}: ${(error as Error).message}`);
      return new Set();
    }
  }

  private async memberUidsOf(appUid: string): Promise<string[]> {
    const rows = await this.prisma.aiAppAudienceMember.findMany({ where: { appUid }, select: { memberUid: true } });
    return sorted(rows.map((row) => row.memberUid));
  }

  private async assertKnown(
    kind: 'policy' | 'permission' | 'member',
    values: string[],
    known: (values: string[]) => Promise<string[]>
  ) {
    if (!values.length) {
      return;
    }
    const knownValues = new Set(await known(values));
    const unknown = values.filter((value) => !knownValues.has(value));
    if (unknown.length) {
      const field = UNKNOWN_FIELD[kind];
      throw new BadRequestException({
        message: `Unknown ${UNKNOWN_LABEL[kind]}: ${unknown.join(', ')}`,
        [field]: unknown,
      });
    }
  }

  private async assertPathFree(path: string, appUid: string) {
    const holder = await this.prisma.aiApp.findFirst({ where: { path, uid: { not: appUid } }, select: { uid: true } });
    if (holder) {
      throw pathTaken(path);
    }
  }

  private async toSettings(app: AiApp): Promise<AiAppAudienceSettings> {
    const memberUids = await this.memberUidsOf(app.uid);
    const members = memberUids.length
      ? await this.prisma.member.findMany({
          where: { uid: { in: memberUids } },
          select: { uid: true, name: true, email: true },
          orderBy: { name: 'asc' },
        })
      : [];
    return {
      appUid: app.uid,
      appId: app.appId,
      name: app.name,
      policyCodes: sorted(app.audiencePolicyCodes),
      permissionCodes: sorted(app.audiencePermissionCodes),
      members: members.map((member) => ({ uid: member.uid, name: member.name, email: member.email ?? null })),
      showInMore: app.showInMore,
      path: app.path,
      iconUrl: app.iconUrl,
      hideTopNav: app.hideTopNav,
      directLinkGateReady: app.directLinkGateReady,
    };
  }

  /** Audit entry with the admin and the resulting settings. A failed write never fails the save. */
  private async recordAudienceUpdated(actorUid: string, app: AiApp, settings: AiAppAudienceSettings): Promise<void> {
    const summary = {
      policyCodes: settings.policyCodes,
      permissionCodes: settings.permissionCodes,
      memberUids: settings.members.map((member) => member.uid),
      showInMore: settings.showInMore,
      path: settings.path,
      iconUrl: settings.iconUrl,
      hideTopNav: settings.hideTopNav,
    };
    try {
      await this.prisma.aiAppEvent.create({
        data: {
          type: 'AUDIENCE_UPDATED',
          memberUid: actorUid,
          appUid: app.uid,
          appId: app.appId,
          message: `Audience settings: ${JSON.stringify(summary)}`,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to record AI App event AUDIENCE_UPDATED: ${(error as Error).message}`);
    }
  }

  private async findApp(appId: string): Promise<AiApp> {
    const app = await this.prisma.aiApp.findFirst({ where: { appId, status: { not: 'DELETED' } } });
    if (!app) {
      throw new NotFoundException(`AI App not found: ${appId}`);
    }
    return app;
  }
}

const UNKNOWN_FIELD = {
  policy: 'unknownPolicyCodes',
  permission: 'unknownPermissionCodes',
  member: 'unknownMemberUids',
} as const;

const UNKNOWN_LABEL = { policy: 'policy codes', permission: 'permission codes', member: 'members' } as const;

function sorted(values: string[] | null | undefined): string[] {
  return [...(values ?? [])].sort();
}

function normalizeList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** `null`/blank clears the path; anything else must be a readable segment that cannot be mistaken for an app uid. */
export function normalizePath(value: string | null): string | null {
  const path = (value ?? '').trim().toLowerCase();
  if (!path) {
    return null;
  }
  if (!APP_PATH_PATTERN.test(path) || path.includes('--') || CUID_PATTERN.test(path)) {
    throw new BadRequestException({
      message: 'Path must be 2–60 lowercase letters, digits or single hyphens, and not start or end with a hyphen',
      code: 'invalid_path',
    });
  }
  return path;
}

/** `null`/blank removes the icon; otherwise an https URL (what the admin image upload returns). */
function normalizeIconUrl(value: string | null): string | null {
  const url = (value ?? '').trim();
  if (!url) {
    return null;
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:') {
    throw new BadRequestException({ message: 'Icon must be an https URL', code: 'invalid_icon_url' });
  }
  return url;
}

function pathTaken(path: string | null): ConflictException {
  return new ConflictException({ message: `Path "${path}" is already used by another app`, code: 'path_taken' });
}
