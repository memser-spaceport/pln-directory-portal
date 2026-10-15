import { Injectable, OnModuleInit } from '@nestjs/common';
import { FeedbackLinearIssue, FeedbackLinearSource } from '@prisma/client';
import { escapeMarkdown, toLinearMarkdown, toPlainText } from '../contact-support/contact-support-html';
import { PrismaService } from '../shared/prisma.service';
import { getFeedbackLinearConfig } from './feedback-linear.config';
import {
  FeedbackLinearHandlerRegistry,
  FeedbackLinearIssueDraft,
  FeedbackLinearPermanentError,
  FeedbackLinearSourceHandler,
} from './feedback-linear-handlers';
import { LinearImageUploader } from './linear-images';
import { LinearTypeLabels, LinearTypeName } from './linear-type-labels';

const TITLE_MAX_LENGTH = 80;
const CONTEXT_MAX_LENGTH = 2000;
const EXPECTED_RESULT_PLACEHOLDER = '_Fill in during triage before moving to Todo._';
/** Linear priorities: 1 Urgent, 2 High, 3 Medium, 4 Low. */
const PRIORITY_BY_LEVEL: Record<string, number> = { P0: 1, P1: 2, P2: 3, P3: 4 };

export function feedbackIssueTitle(message: string, fallback: string): string {
  const firstLine =
    toPlainText(message)
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  const text = firstLine || fallback;
  const clipped = text.length > TITLE_MAX_LENGTH ? `${text.slice(0, TITLE_MAX_LENGTH - 1)}…` : text;
  return `[Feedback] ${clipped}`;
}

export function feedbackTypeName(topic: string, reportKind: unknown): LinearTypeName {
  if (topic === 'Report a bug' || reportKind === 'bug') return 'Bug';
  if (topic === 'Share an idea') return 'Feature';
  return 'Improvement';
}

function hideEmail(text: string, email: string | null): string {
  if (!email) return text;
  // The markdown pass may have put a backslash before characters of the address (e.g. `_`).
  const pattern = [...email].map((char) => `\\\\?${char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('');
  return text.replace(new RegExp(pattern, 'gi'), '[email hidden]');
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
    private readonly typeLabels: LinearTypeLabels
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async buildIssue(row: FeedbackLinearIssue): Promise<FeedbackLinearIssueDraft> {
    const config = getFeedbackLinearConfig();
    if (!config) {
      throw new Error('Linear is not configured');
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
    const typeLabelId = await this.typeLabels.find(row.teamId, feedbackTypeName(request.topic, metadata.reportKind));
    if (typeLabelId) labelIds.push(typeLabelId);

    const priority = typeof metadata.priority === 'string' ? PRIORITY_BY_LEVEL[metadata.priority] : undefined;
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
    if (input.context && typeof input.context === 'object') {
      const json = JSON.stringify(input.context, null, 2).slice(0, CONTEXT_MAX_LENGTH);
      sections.push(`## Context\n\n\`\`\`json\n${json}\n\`\`\``);
    }
    sections.push(`## Expected result\n\n${EXPECTED_RESULT_PLACEHOLDER}`);
    sections.push(`---\nLabOS contact-support request \`${input.requestUid}\``);
    return sections.join('\n\n');
  }
}
