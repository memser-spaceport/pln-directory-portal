import { Injectable, NotFoundException } from '@nestjs/common';
import { McpAccessRequest, McpConnection, McpScopeKey } from 'libs/contracts/src/schema/mcp-scopes';
import { PrismaService } from '../shared/prisma.service';
import { levelAtLeast } from './mcp-scopes.registry';

/** An open request is reused for the same connection and scope within this window. */
export const MCP_ACCESS_REQUEST_REUSE_MS = 24 * 60 * 60 * 1000;
/** A request not resolved within this window is expired. */
export const MCP_ACCESS_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RequestRow = {
  uid: string;
  authorizationUid: string;
  scope: string;
  level: string;
  toolName: string;
  createdAt: Date;
  resolvedAt: Date | null;
};

export function accessRequestStatus(row: Pick<RequestRow, 'createdAt' | 'resolvedAt'>, now = Date.now()) {
  if (row.resolvedAt) return 'resolved' as const;
  return now - row.createdAt.getTime() >= MCP_ACCESS_REQUEST_TTL_MS ? ('expired' as const) : ('open' as const);
}

/**
 * Refused MCP calls the member can fix in Settings (LAB-2995 / LAB-3014). A refusal links to
 * `/settings/mcp?request=<uid>`; the page opens that connection's drawer with the scope preset.
 */
@Injectable()
export class McpAccessRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The open request for this connection and scope from the last 24 hours, or a new one. Returns its uid. */
  async createOrReuse(authorizationUid: string, scope: McpScopeKey, level: 'read' | 'write', toolName: string) {
    const open = await this.prisma.mcpAccessRequest.findFirst({
      where: {
        authorizationUid,
        scope,
        resolvedAt: null,
        createdAt: { gt: new Date(Date.now() - MCP_ACCESS_REQUEST_REUSE_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { uid: true, level: true },
    });
    if (open) {
      if (level === 'write' && open.level !== 'write') {
        await this.prisma.mcpAccessRequest.update({ where: { uid: open.uid }, data: { level, toolName } });
      }
      return open.uid;
    }
    const created = await this.prisma.mcpAccessRequest.create({
      data: { authorizationUid, scope, level, toolName },
      select: { uid: true },
    });
    return created.uid;
  }

  /** One request, only for the member who owns its connection. */
  async getForMember(memberUid: string, uid: string): Promise<McpAccessRequest> {
    const row = await this.prisma.mcpAccessRequest.findUnique({
      where: { uid },
      include: { authorization: { select: { memberUid: true } } },
    });
    if (!row || row.authorization.memberUid !== memberUid) {
      throw new NotFoundException('Access request not found');
    }
    return {
      uid: row.uid,
      authorizationUid: row.authorizationUid,
      scope: row.scope as McpScopeKey,
      level: row.level === 'write' ? 'write' : 'read',
      toolName: row.toolName,
      status: accessRequestStatus(row),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Marks the request resolved when a save on its own connection reaches the requested level. Returns whether it did.
   * A request for another connection, or one already resolved or expired, is left alone.
   */
  async resolveIfMet(requestUid: string, connection: McpConnection): Promise<boolean> {
    const row = await this.prisma.mcpAccessRequest.findUnique({ where: { uid: requestUid } });
    if (!row || row.authorizationUid !== connection.uid || accessRequestStatus(row) !== 'open') {
      return false;
    }
    const scope = connection.scopes.find((s) => s.key === row.scope);
    if (!scope || !levelAtLeast(scope.level, row.level === 'write' ? 'write' : 'read')) {
      return false;
    }
    const updated = await this.prisma.mcpAccessRequest.updateMany({
      where: { uid: requestUid, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    return updated.count === 1;
  }
}
