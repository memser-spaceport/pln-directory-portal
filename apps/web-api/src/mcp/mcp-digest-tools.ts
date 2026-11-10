import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { LabosDigestNewsQuerySchema, LabosDigestSendsQuerySchema } from 'libs/contracts/src/schema/team-news';
import { LabosDigestService } from '../team-news/labos-digest.service';
import { McpActorContext, McpToolDef } from './mcp-tools';

function requireAdmin(ctx: McpActorContext) {
  if (!ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)) {
    throw new ForbiddenException('Only directory admins can read digest news');
  }
}

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Directory-admin reads of the LabOS Digest service API. */
export function digestAdminNewsTools(digest: LabosDigestService): McpToolDef[] {
  return [
    {
      name: 'list_all_news',
      description:
        'List all found LabOS news for a directory admin. Filter by date, tags, or text in the title, summary, or content. ' +
        'Returns title, summary, source, link, date, tags, and team.',
      visibility: 'directory_admin',
      inputSchema: {
        from: z.string().optional().describe('eventDate from, ISO date'),
        to: z.string().optional().describe('eventDate to, ISO date'),
        tags: z.string().optional().describe('Comma-separated tags; a story matches any of them'),
        q: z.string().optional().describe('Text in the title, summary, or content'),
        page: z.number().int().min(1).optional().describe('Default 1'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 50'),
      },
      execute: async (ctx, args = {}) => {
        requireAdmin(ctx);
        const query = LabosDigestNewsQuerySchema.parse({
          from: stringArg(args.from),
          to: stringArg(args.to),
          tags: stringArg(args.tags),
          q: stringArg(args.q),
          page: args.page,
          limit: args.limit,
        });
        const page = await digest.listServiceNews(query);
        return { page: page.page, limit: page.limit, total: page.total, items: page.items };
      },
    },
    {
      name: 'get_digest_top_stories',
      description:
        'Top stories for the next daily and weekly digest, in order. Each story is marked admin or ai, and each frequency says if the first story is the email lead.',
      visibility: 'directory_admin',
      execute: async (ctx) => {
        requireAdmin(ctx);
        const view = await digest.getView();
        return {
          source: view.source,
          stories: view.stories,
          daily: view.daily,
          weekly: view.weekly,
        };
      },
    },
    {
      name: 'list_digest_sends',
      description: 'List past digest sends and the top stories each one used.',
      visibility: 'directory_admin',
      inputSchema: {
        frequency: z.enum(['daily', 'weekly']).optional(),
        page: z.number().int().min(1).optional().describe('Default 1'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 50'),
      },
      execute: async (ctx, args = {}) => {
        requireAdmin(ctx);
        const query = LabosDigestSendsQuerySchema.parse({
          frequency: args.frequency,
          page: args.page,
          limit: args.limit,
        });
        const page = await digest.listSends(query);
        return { page: page.page, limit: page.limit, total: page.total, items: page.items };
      },
    },
    {
      name: 'get_digest_send',
      description: 'Top stories of one past digest, in order.',
      visibility: 'directory_admin',
      inputSchema: {
        uid: z.string().describe('Digest send uid from list_digest_sends'),
      },
      execute: async (ctx, args = {}) => {
        requireAdmin(ctx);
        const uid = stringArg(args.uid);
        if (!uid) throw new BadRequestException('uid is required');
        const send = await digest.getSend(uid);
        return { ...send };
      },
    },
  ];
}
