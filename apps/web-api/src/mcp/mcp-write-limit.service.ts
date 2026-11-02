import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

/** Agent write tools: at most this many calls per member per tool per hour (LAB-3020). */
export const MCP_WRITE_LIMIT_PER_HOUR = 10;
const HOUR_SECONDS = 60 * 60;

/**
 * A fixed-window counter per member and write tool in the shared cache. The cache is not transactional, so two
 * simultaneous calls can both see the last free slot; that slack is acceptable for spam protection. If the cache is
 * unavailable the call is allowed (fail open): a cache outage must not lock members out of their own agents.
 */
@Injectable()
export class McpWriteLimitService {
  private readonly logger = new Logger(McpWriteLimitService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /** Counts this call; returns false when the member already used the hour's allowance for this tool. */
  async tryConsume(memberUid: string, toolName: string, now = Date.now()): Promise<boolean> {
    const bucket = Math.floor(now / (HOUR_SECONDS * 1000));
    const key = `mcp:write:${memberUid}:${toolName}:${bucket}`;
    try {
      const used = (await this.cache.get<number>(key)) ?? 0;
      if (used >= MCP_WRITE_LIMIT_PER_HOUR) {
        return false;
      }
      await this.cache.set(key, used + 1, { ttl: HOUR_SECONDS });
      return true;
    } catch (error) {
      this.logger.warn(`MCP write limit unavailable, allowing ${toolName}: ${String(error)}`);
      return true;
    }
  }
}
