import { Injectable, OnModuleInit } from '@nestjs/common';
import { FeedbackLinearIssue, FeedbackLinearSource } from '@prisma/client';
import { escapeMarkdown, toLinearMarkdown } from '../contact-support/contact-support-html';
import {
  FEEDBACK_EXPECTED_RESULT_SECTION,
  feedbackContextSection,
  feedbackIssueTitle,
  feedbackPriority,
  hideEmail,
} from '../feedback-linear/feedback-issue-text';
import { getFeedbackLinearCredentials } from '../feedback-linear/feedback-linear.config';
import {
  FeedbackLinearHandlerRegistry,
  FeedbackLinearIssueDraft,
  FeedbackLinearPermanentError,
  FeedbackLinearSourceHandler,
} from '../feedback-linear/feedback-linear-handlers';
import { LinearClient } from '../feedback-linear/linear.client';
import { LinearImageUploader } from '../feedback-linear/linear-images';
import { LinearTeamMeta, LinearTypeName } from '../feedback-linear/linear-team-meta';
import { PrismaService } from '../shared/prisma.service';
import { AI_APPS_PORTAL_URL, aiAppFeedbackPath } from './ai-apps.constants';

const USER_FEEDBACK_LABEL = 'User feedback';
const TYPE_BY_REPORT_KIND: Record<string, LinearTypeName> = { bug: 'Bug', request: 'Improvement' };

/** Builds the owner-team issue for a private AI App feedback item (docs/FEEDBACK_LINEAR.md). */
@Injectable()
export class AiAppFeedbackLinearHandler implements FeedbackLinearSourceHandler, OnModuleInit {
  readonly sourceType = FeedbackLinearSource.AI_APP_FEEDBACK;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FeedbackLinearHandlerRegistry,
    private readonly linear: LinearClient,
    private readonly images: LinearImageUploader,
    private readonly teamMeta: LinearTeamMeta
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async buildIssue(row: FeedbackLinearIssue): Promise<FeedbackLinearIssueDraft> {
    const credentials = getFeedbackLinearCredentials();
    if (!credentials) {
      throw new Error('Linear is not configured');
    }
    const item = await this.prisma.aiAppFeedback.findUnique({
      where: { uid: row.sourceUid },
      include: { _count: { select: { pins: true } } },
    });
    if (!item) {
      throw new FeedbackLinearPermanentError(`AI App feedback ${row.sourceUid} not found`);
    }
    const app = await this.prisma.aiApp.findUnique({ where: { uid: item.appUid } });
    if (!app) {
      throw new FeedbackLinearPermanentError(`AI App ${item.appUid} not found`);
    }
    const [reporter, owner] = await Promise.all([
      this.prisma.member.findUnique({ where: { uid: item.memberUid }, select: { uid: true, name: true, email: true } }),
      this.prisma.member.findUnique({ where: { uid: app.memberUid }, select: { email: true } }),
    ]);
    if (!reporter) {
      throw new FeedbackLinearPermanentError(`Reporter of AI App feedback ${item.uid} not found`);
    }

    const { markdown, images } = toLinearMarkdown(item.text);
    const imageLines = await this.images.rehost(images, credentials.imageHosts);
    const stateId = await this.teamMeta.intakeStateId(row.teamId);

    const labelIds: string[] = [];
    const userFeedbackLabel = await this.teamMeta.labelId(row.teamId, USER_FEEDBACK_LABEL);
    if (userFeedbackLabel) labelIds.push(userFeedbackLabel);
    const typeName = item.reportKind ? TYPE_BY_REPORT_KIND[item.reportKind] : undefined;
    const typeLabel = typeName ? await this.teamMeta.typeLabelId(row.teamId, typeName) : null;
    if (typeLabel) labelIds.push(typeLabel);

    const assignee = owner?.email ? await this.linear.userByEmail(owner.email) : null;
    const priority = feedbackPriority(item.priority);
    const context = (item.context ?? null) as Record<string, unknown> | null;
    const environment = typeof context?.env === 'string' ? context.env : process.env.ENVIRONMENT || 'unknown';
    const portal = AI_APPS_PORTAL_URL || process.env.WEB_UI_BASE_URL || '';
    const itemLink = `${portal}${aiAppFeedbackPath(app.uid, item.uid, item._count.pins > 0, 'FEEDBACK')}`;
    const profile = `${process.env.WEB_UI_BASE_URL ?? ''}/members/${reporter.uid}`;

    const sections = [
      `Reported by [${escapeMarkdown(reporter.name)}](${profile}) · ${escapeMarkdown(app.name)} · ${environment}`,
      `## What they said\n\n${markdown || '_No message._'}`,
    ];
    if (imageLines.length) sections.push(`## Screenshots\n\n${imageLines.join('\n\n')}`);
    const contextSection = feedbackContextSection(context);
    if (contextSection) sections.push(contextSection);
    sections.push(FEEDBACK_EXPECTED_RESULT_SECTION);
    sections.push(`---\n[Open in LabOS](${itemLink}) · AI App feedback \`${item.uid}\``);

    return {
      teamId: row.teamId,
      stateId,
      title: hideEmail(feedbackIssueTitle(item.text, app.name, `[${app.name}]`), reporter.email),
      description: hideEmail(sections.join('\n\n'), reporter.email),
      ...(row.projectId ? { projectId: row.projectId } : {}),
      ...(labelIds.length ? { labelIds } : {}),
      ...(priority ? { priority } : {}),
      ...(assignee ? { assigneeId: assignee.id } : {}),
      createAsUser: reporter.name,
    };
  }

  /** The closing note the owner's agent left, as markdown; null when it is gone. */
  async buildComment(_row: FeedbackLinearIssue, commentUid: string): Promise<string | null> {
    const comment = await this.prisma.aiAppFeedbackComment.findUnique({
      where: { uid: commentUid },
      select: { text: true },
    });
    if (!comment) return null;
    const { markdown } = toLinearMarkdown(comment.text);
    return `Closing note from LabOS:\n\n${markdown || '_No text._'}`;
  }
}
