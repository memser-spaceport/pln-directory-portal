import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { AiAppsService } from '../ai-apps/ai-apps.service';
import { FEEDBACK_COMMENT_MAX_LENGTH } from '../ai-apps/dto/feedback-comment.dto';
import { McpToolDef } from './mcp-tools';

const FEEDBACK_LIMIT_MAX = 50;
const FEEDBACK_LIMIT_DEFAULT = 20;
const FEEDBACK_LIST_STATUSES = ['NEW', 'VIEWED', 'IMPLEMENTED'] as const;
const FEEDBACK_UPDATE_STATUSES = ['VIEWED', 'IMPLEMENTED'] as const;

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function clampLimit(value: unknown): number {
  const num = Number(value ?? FEEDBACK_LIMIT_DEFAULT);
  if (!Number.isFinite(num)) return FEEDBACK_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(num), 1), FEEDBACK_LIMIT_MAX);
}

function dateArg(value: unknown, name: string): Date | undefined {
  const raw = stringArg(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${name} must be an ISO 8601 date or date-time`);
  }
  return date;
}

/** Hosted image URLs in the feedback text plus each pin's crop: what the LabOS review shows as screenshots. */
export function feedbackScreenshotUrls(item: { text?: unknown; pins?: Array<{ cropUrl?: string | null }> }): string[] {
  const urls: string[] = [];
  const text = typeof item.text === 'string' ? item.text : '';
  for (const match of text.matchAll(/<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi)) {
    urls.push(match[1]);
  }
  for (const pin of item.pins ?? []) {
    if (pin.cropUrl) urls.push(pin.cropUrl);
  }
  return Array.from(new Set(urls));
}

export function aiAppFeedbackTools(aiApps: AiAppsService): McpToolDef[] {
  return [
    {
      name: 'list_my_ai_apps',
      description:
        'List the AI Apps you created (uid, appId, name, status, feedbackEnabled). Then call list_ai_app_feedback with an app uid.',
      visibility: 'always',
      execute: async (ctx) => ({ apps: await aiApps.listOwnAppsForMcp(ctx.memberUid) }),
    },
    {
      name: 'list_ai_app_feedback',
      description:
        'List feedback on one AI App you created, newest first. Each item has the full text (HTML), screenshotUrls, the annotation pins and the conversation. Filter by status and by a createdAt date range. Page with limit (max 50) and offset; nextOffset is null on the last page.',
      visibility: 'always',
      inputSchema: {
        appUid: z.string().min(1).describe('App uid from list_my_ai_apps'),
        status: z
          .enum(FEEDBACK_LIST_STATUSES)
          .optional()
          .describe('Only items with this status: NEW, VIEWED or IMPLEMENTED'),
        from: z.string().optional().describe('Only items created at or after this ISO 8601 date or date-time'),
        to: z.string().optional().describe('Only items created at or before this ISO 8601 date or date-time'),
        limit: z.number().int().min(1).max(FEEDBACK_LIMIT_MAX).optional().describe('Max items (default 20, max 50)'),
        offset: z.number().int().min(0).optional().describe('Pagination offset (use nextOffset from the last page)'),
      },
      execute: async (ctx, args = {}) => {
        const limit = clampLimit(args.limit);
        const offset = Math.max(Math.trunc(Number(args.offset ?? 0)) || 0, 0);
        const status = FEEDBACK_LIST_STATUSES.find((value) => value === args.status);
        const { items, total } = await aiApps.listFeedbackForMcp(ctx.memberUid, stringArg(args.appUid) ?? '', {
          status,
          from: dateArg(args.from, 'from'),
          to: dateArg(args.to, 'to'),
          limit,
          offset,
        });
        return {
          items: items.map((item) => ({ ...item, screenshotUrls: feedbackScreenshotUrls(item) })),
          total,
          limit,
          offset,
          nextOffset: offset + items.length < total ? offset + items.length : null,
        };
      },
    },
    {
      name: 'update_ai_app_feedback_status',
      description:
        'Mark one feedback item on an AI App you created as VIEWED or IMPLEMENTED. With IMPLEMENTED you may add a short closing note on what changed; it is added to the conversation and the member who left the feedback is told.',
      visibility: 'always',
      inputSchema: {
        appUid: z.string().min(1).describe('App uid from list_my_ai_apps'),
        feedbackUid: z.string().min(1).describe('Feedback item uid from list_ai_app_feedback'),
        status: z.enum(FEEDBACK_UPDATE_STATUSES).describe('VIEWED or IMPLEMENTED'),
        note: z
          .string()
          .max(FEEDBACK_COMMENT_MAX_LENGTH)
          .optional()
          .describe(`Closing note, only with IMPLEMENTED (max ${FEEDBACK_COMMENT_MAX_LENGTH})`),
      },
      execute: async (ctx, args = {}) => {
        const status = FEEDBACK_UPDATE_STATUSES.find((value) => value === args.status);
        if (!status) {
          throw new BadRequestException('status must be VIEWED or IMPLEMENTED');
        }
        const note = stringArg(args.note);
        if (note && status !== 'IMPLEMENTED') {
          throw new BadRequestException('A closing note is only accepted with status IMPLEMENTED');
        }
        const updated = await aiApps.updateFeedbackStatusForMcp(
          ctx.memberUid,
          stringArg(args.appUid) ?? '',
          stringArg(args.feedbackUid) ?? '',
          status,
          note
        );
        return { uid: updated.uid, appUid: updated.appUid, status: updated.status, hasNote: Boolean(note) };
      },
    },
  ];
}
