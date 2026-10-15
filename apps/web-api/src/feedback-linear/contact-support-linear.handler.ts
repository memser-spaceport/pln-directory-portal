import { Injectable, OnModuleInit } from '@nestjs/common';
import { FeedbackLinearIssue, FeedbackLinearSource } from '@prisma/client';
import { escapeMarkdown, toLinearMarkdown } from '../contact-support/contact-support-html';
import { PrismaService } from '../shared/prisma.service';
import { getFeedbackLinearConfig } from './feedback-linear.config';
import {
  FEEDBACK_EXPECTED_RESULT_SECTION,
  feedbackContextSection,
  feedbackIssueTitle,
  feedbackPriority,
  hideEmail,
} from './feedback-issue-text';
import {
  FeedbackLinearHandlerRegistry,
  FeedbackLinearIssueDraft,
  FeedbackLinearPermanentError,
  FeedbackLinearSourceHandler,
} from './feedback-linear-handlers';
import { LinearImageUploader } from './linear-images';
import { LinearTeamMeta, LinearTypeName } from './linear-team-meta';

export function feedbackTypeName(topic: string, reportKind: unknown): LinearTypeName {
  if (topic === 'Report a bug' || reportKind === 'bug') return 'Bug';
  if (topic === 'Share an idea') return 'Feature';
  return 'Improvement';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Builds the LAB issue for a platform-feedback contact-support request. */
@Injectable()
export class ContactSupportLinearHandler implements FeedbackLinearSourceHandler, OnModuleInit {
  readonly sourceType = FeedbackLinearSource.CONTACT_SUPPORT;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FeedbackLinearHandlerRegistry,
    private readonly images: LinearImageUploader,
    private readonly teamMeta: LinearTeamMeta
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async buildIssue(row: FeedbackLinearIssue): Promise<FeedbackLinearIssueDraft> {
    const config = getFeedbackLinearConfig();
    if (!config) {
      throw new Error('Platform feedback to Linear is not configured');
    }
    const request = await this.prisma.contactSupportRequest.findUnique({ where: { uid: row.sourceUid } });
    if (!request) {
      throw new FeedbackLinearPermanentError(`Contact support request ${row.sourceUid} not found`);
    }
    const metadata = asRecord(request.metadata);
    const memberUid = typeof metadata.uid === 'string' ? metadata.uid : '';
    const member = memberUid
      ? await this.prisma.member.findUnique({
          where: { uid: memberUid },
          select: { uid: true, name: true, email: true },
        })
      : null;
    if (!member) {
      throw new FeedbackLinearPermanentError(`Reporter of contact support request ${request.uid} not found`);
    }
    const email = member.email ?? request.email ?? null;

    const message = request.message ?? '';
    const { markdown, images } = toLinearMarkdown(message);
    const imageLines = await this.images.rehost(images, config.imageHosts);

    const labelIds: string[] = [];
    if (config.labelId) labelIds.push(config.labelId);
    const typeLabelId = await this.teamMeta.typeLabelId(
      row.teamId,
      feedbackTypeName(request.topic, metadata.reportKind)
    );
    if (typeLabelId) labelIds.push(typeLabelId);

    const priority = feedbackPriority(metadata.priority);
    const description = hideEmail(
      this.body({
        memberName: member.name,
        memberUid: member.uid,
        topic: request.topic,
        page: metadata.page,
        markdown,
        imageLines,
        context: metadata.context,
        requestUid: request.uid,
      }),
      email
    );

    return {
      teamId: row.teamId,
      stateId: config.platformStateId,
      title: hideEmail(feedbackIssueTitle(message, request.topic), email),
      description,
      ...(row.projectId ? { projectId: row.projectId } : {}),
      ...(labelIds.length ? { labelIds } : {}),
      ...(priority ? { priority } : {}),
      createAsUser: member.name,
    };
  }

  private body(input: {
    memberName: string;
    memberUid: string;
    topic: string;
    page: unknown;
    markdown: string;
    imageLines: string[];
    context: unknown;
    requestUid: string;
  }): string {
    const profile = `${process.env.WEB_UI_BASE_URL ?? ''}/members/${input.memberUid}`;
    const environment = process.env.ENVIRONMENT || 'unknown';
    const sections = [
      `Reported by [${escapeMarkdown(input.memberName)}](${profile}) · ${escapeMarkdown(input.topic)} · ${environment}`,
    ];
    if (typeof input.page === 'string' && /^https?:\/\/\S+$/i.test(input.page)) {
      sections.push(`Page: <${input.page}>`);
    }
    sections.push(`## What they said\n\n${input.markdown || '_No message._'}`);
    if (input.imageLines.length) {
      sections.push(`## Screenshots\n\n${input.imageLines.join('\n\n')}`);
    }
    const context = feedbackContextSection(input.context);
    if (context) sections.push(context);
    sections.push(FEEDBACK_EXPECTED_RESULT_SECTION);
    sections.push(`---\nLabOS contact-support request \`${input.requestUid}\``);
    return sections.join('\n\n');
  }
}
