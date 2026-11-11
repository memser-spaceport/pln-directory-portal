import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiApp } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { buildAppUrl } from './ai-apps.constants';

/** An app's audience as Back Office shows and saves it. */
export interface AiAppAudienceSettings {
  appUid: string;
  appId: string;
  name: string;
  /** Policy codes the app is published to. Empty = PL Infra only. */
  policyCodes: string[];
  /** False while the app still runs a sidecar that predates per-app decisions; group members are refused until a redeploy. */
  directLinkGateReady: boolean;
}

/** A published app as LabOS lists it under More for a member in its audience. */
export interface PublishedAiApp {
  uid: string;
  appId: string;
  name: string;
  description: string | null;
  url: string;
}

type AudienceApp = Pick<AiApp, 'audiencePolicyCodes'>;

/**
 * Publishing an app to members outside PL Infra (LAB-3200). A directory admin
 * sets a list of policy codes on the app; an approved member who holds any of
 * them may open the production app without `ai_apps.read`/`write`. The
 * audience never grants the AI Apps catalog, the preview target or any
 * management route.
 */
@Injectable()
export class AiAppsAudienceService {
  private readonly logger = new Logger(AiAppsAudienceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether the member is in the app's audience: the app is published, the
   * member is approved and holds one of its policies. Read on every request,
   * so clearing the audience or removing a policy applies at once.
   */
  async isInAudience(memberUid: string | undefined, app: AudienceApp | null | undefined): Promise<boolean> {
    const policyCodes = app?.audiencePolicyCodes ?? [];
    if (!memberUid || !policyCodes.length) {
      return false;
    }
    const held = await this.prisma.policyAssignment.findFirst({
      where: {
        memberUid,
        policy: { code: { in: policyCodes } },
        member: { memberApproval: { state: 'APPROVED' } },
      },
      select: { uid: true },
    });
    return !!held;
  }

  /** {@link isInAudience} for the non-DELETED app holding `appId` (the auth gate names the app by appId). */
  async isInAudienceOfAppId(memberUid: string | undefined, appId: string | undefined): Promise<boolean> {
    if (!memberUid || !appId) {
      return false;
    }
    const app = await this.prisma.aiApp.findFirst({
      where: { appId, status: { not: 'DELETED' }, audiencePolicyCodes: { isEmpty: false } },
      select: { audiencePolicyCodes: true },
    });
    return this.isInAudience(memberUid, app);
  }

  /** Live apps published to the member. Needs no AI Apps permission: this is what a group member sees under More. */
  async listPublishedFor(memberUid: string): Promise<PublishedAiApp[]> {
    const assignments = await this.prisma.policyAssignment.findMany({
      where: { memberUid, member: { memberApproval: { state: 'APPROVED' } } },
      select: { policy: { select: { code: true } } },
    });
    const policyCodes = assignments.map((assignment) => assignment.policy.code);
    if (!policyCodes.length) {
      return [];
    }
    const apps = await this.prisma.aiApp.findMany({
      where: {
        status: { notIn: ['DELETED', 'DELETING'] },
        lastDeployedAt: { not: null },
        audiencePolicyCodes: { hasSome: policyCodes },
      },
      select: { uid: true, appId: true, name: true, description: true, url: true },
      orderBy: { name: 'asc' },
    });
    return apps.map((app) => ({
      uid: app.uid,
      appId: app.appId,
      name: app.name,
      description: app.description,
      url: app.url ?? buildAppUrl(app.appId, 'prod'),
    }));
  }

  async getAudience(appId: string): Promise<AiAppAudienceSettings> {
    return toSettings(await this.findApp(appId));
  }

  /**
   * Replaces the app's audience (`[]` takes the app back). Every code must be
   * an existing policy, otherwise nothing is saved. A real change is audited
   * as `AUDIENCE_UPDATED`; saving the stored list again is a no-op.
   */
  async updateAudience(actorUid: string, appId: string, policyCodes: string[]): Promise<AiAppAudienceSettings> {
    const app = await this.findApp(appId);
    const next = Array.from(new Set(policyCodes)).sort();
    if (next.length) {
      const known = await this.prisma.policy.findMany({ where: { code: { in: next } }, select: { code: true } });
      const knownCodes = new Set(known.map((policy) => policy.code));
      const unknownPolicyCodes = next.filter((code) => !knownCodes.has(code));
      if (unknownPolicyCodes.length) {
        throw new BadRequestException({
          message: `Unknown policy codes: ${unknownPolicyCodes.join(', ')}`,
          unknownPolicyCodes,
        });
      }
    }
    const current = [...(app.audiencePolicyCodes ?? [])].sort();
    if (current.length === next.length && current.every((code, index) => code === next[index])) {
      return toSettings(app);
    }
    const updated = await this.prisma.aiApp.update({ where: { uid: app.uid }, data: { audiencePolicyCodes: next } });
    await this.recordAudienceUpdated(actorUid, updated);
    return toSettings(updated);
  }

  /** Audit entry with the admin and the resulting list (`[]` = taken back). A failed write never fails the save. */
  private async recordAudienceUpdated(actorUid: string, app: AiApp): Promise<void> {
    try {
      await this.prisma.aiAppEvent.create({
        data: {
          type: 'AUDIENCE_UPDATED',
          memberUid: actorUid,
          appUid: app.uid,
          appId: app.appId,
          message: `Audience policies: ${JSON.stringify(app.audiencePolicyCodes ?? [])}`,
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

function toSettings(app: AiApp): AiAppAudienceSettings {
  return {
    appUid: app.uid,
    appId: app.appId,
    name: app.name,
    policyCodes: [...(app.audiencePolicyCodes ?? [])].sort(),
    directLinkGateReady: app.directLinkGateReady,
  };
}
