import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiApp, FeedbackLinearSource, FeedbackLinearStatus } from '@prisma/client';
import { getFeedbackLinearCredentials } from '../feedback-linear/feedback-linear.config';
import { LinearClient, LinearProjectRef } from '../feedback-linear/linear.client';
import { PrismaService } from '../shared/prisma.service';
import { isDirectoryAdmin } from '../utils/constants';
import { AiAppsService } from './ai-apps.service';
import { UpdateAiAppLinearTargetDto } from './dto/ai-app-linear-target.dto';

export interface AiAppLinearTeamOption {
  id: string;
  key: string;
  name: string;
  projects: LinearProjectRef[];
}

export interface AiAppLinearTarget {
  teamId: string | null;
  projectId: string | null;
  setAt: Date | null;
}

/**
 * Where an AI App's private feedback goes in Linear (docs/FEEDBACK_LINEAR.md):
 * the owner or a directory admin picks one of their private Linear teams.
 */
@Injectable()
export class AiAppsLinearService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAppsService: AiAppsService,
    private readonly linear: LinearClient
  ) {}

  /**
   * Private teams the requester may pick: the ones they belong to in Linear
   * (matched by their LabOS email), or every private team the Linear app can
   * see for a directory admin. Public teams are never offered.
   */
  async listTeams(requesterUid: string): Promise<AiAppLinearTeamOption[]> {
    this.assertConfigured();
    const requester = await this.prisma.member.findUnique({
      where: { uid: requesterUid },
      select: { email: true, memberRoles: { select: { name: true } } },
    });
    if (!requester) {
      return [];
    }
    const teams = (await this.linear.teams()).filter((team) => team.private);
    let visible = teams;
    if (!isDirectoryAdmin(requester)) {
      const user = requester.email ? await this.linear.userByEmail(requester.email) : null;
      if (!user) {
        return [];
      }
      const own = new Set(user.teamIds);
      visible = teams.filter((team) => own.has(team.id));
    }
    return visible
      .map(({ id, key, name, projects }) => ({ id, key, name, projects }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTarget(requesterUid: string, uid: string): Promise<AiAppLinearTarget> {
    this.assertConfigured();
    return toTarget(await this.findManageableApp(requesterUid, uid));
  }

  /**
   * Replaces the app's target. The team must be private and visible to the
   * Linear app, and the project must belong to it. Saving a team re-queues the
   * app's failed pushes.
   */
  async updateTarget(requesterUid: string, uid: string, dto: UpdateAiAppLinearTargetDto): Promise<AiAppLinearTarget> {
    this.assertConfigured();
    const app = await this.findManageableApp(requesterUid, uid);
    if (dto.teamId === null) {
      const cleared = await this.prisma.aiApp.update({
        where: { uid: app.uid },
        data: { linearTeamId: null, linearProjectId: null, linearTargetSetAt: null },
      });
      return toTarget(cleared);
    }

    const team = await this.linear.team(dto.teamId);
    if (!team) {
      throw new BadRequestException(`Linear team ${dto.teamId} not found or not shared with the Linear app`);
    }
    if (!team.private) {
      throw new BadRequestException(`Linear team ${dto.teamId} is public; choose a private team`);
    }
    const projectId = dto.projectId ?? null;
    if (projectId && !team.projects.some((project) => project.id === projectId)) {
      throw new BadRequestException(`Linear project ${projectId} is not in team ${team.key}`);
    }

    const updated = await this.prisma.aiApp.update({
      where: { uid: app.uid },
      data: { linearTeamId: team.id, linearProjectId: projectId, linearTargetSetAt: new Date() },
    });
    await this.requeueFailed(app.uid);
    return toTarget(updated);
  }

  private async requeueFailed(appUid: string): Promise<void> {
    const feedback = await this.prisma.aiAppFeedback.findMany({ where: { appUid }, select: { uid: true } });
    if (feedback.length === 0) return;
    await this.prisma.feedbackLinearIssue.updateMany({
      where: {
        sourceType: FeedbackLinearSource.AI_APP_FEEDBACK,
        sourceUid: { in: feedback.map((row) => row.uid) },
        status: FeedbackLinearStatus.FAILED,
      },
      data: { status: FeedbackLinearStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), leaseUntil: null },
    });
  }

  private async findManageableApp(requesterUid: string, uid: string): Promise<AiApp> {
    const app = await this.prisma.aiApp.findUnique({ where: { uid } });
    if (!app || app.status === 'DELETED') {
      throw new NotFoundException(`AI App not found: ${uid}`);
    }
    if (!(await this.aiAppsService.isCreatorOrDirectoryAdmin(requesterUid, app))) {
      throw new ForbiddenException('Only the app creator or a directory admin can manage the Linear target');
    }
    return app;
  }

  private assertConfigured(): void {
    if (!getFeedbackLinearCredentials()) {
      throw new ServiceUnavailableException('Linear is not configured');
    }
  }
}

function toTarget(app: Pick<AiApp, 'linearTeamId' | 'linearProjectId' | 'linearTargetSetAt'>): AiAppLinearTarget {
  return { teamId: app.linearTeamId, projectId: app.linearProjectId, setAt: app.linearTargetSetAt };
}
