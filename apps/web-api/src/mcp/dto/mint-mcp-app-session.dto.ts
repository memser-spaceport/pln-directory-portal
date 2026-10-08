import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import { AppIdSchema } from '../../ai-apps/dto/app-session.dto';

/** `POST /v1/mcp/app-sessions`. The MCP access token arrives as a Bearer header, not in this body. */
export const MintMcpAppSessionSchema = z.object({ appId: AppIdSchema });
export class MintMcpAppSessionDto extends createZodDto(MintMcpAppSessionSchema) {}
