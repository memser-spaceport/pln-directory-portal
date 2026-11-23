import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ZodType, ZodTypeDef } from 'zod';
import {
  LABOS_AGENT_ERROR_CODES,
  LabosAgentAccessResponse,
  LabosAgentChatRequestSchema,
  LabosAgentConfirmRequestSchema,
  LabosAgentConfirmResponse,
  LabosAgentMentionsQuerySchema,
  LabosAgentMentionsResponse,
} from 'libs/contracts/src/schema/labos-agent';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { logSafeError } from '../husky/log-safe-error.util';
import { LabosAgentExceptionFilter } from './labos-agent-exception.filter';
import { LabosAgentService } from './labos-agent.service';

/** LabOS in-app agent, contracts C1, C2 and C4 (LAB-3272; slices S1 LAB-3298, S2 LAB-3299, S6 LAB-3318). */
@Controller('v1/labos-agent')
// Error bodies keep their `code` (LAB-3300). The global LogException drops it.
@UseFilters(LabosAgentExceptionFilter)
export class LabosAgentController {
  private readonly logger = new Logger(LabosAgentController.name);

  constructor(private readonly agent: LabosAgentService) {}

  /** The frontend shows the agent dock only when this is true. Never 403. */
  @Get('access')
  @UseGuards(UserTokenValidation)
  async access(@Req() req: { userEmail?: string }): Promise<LabosAgentAccessResponse> {
    return { enabled: await this.agent.isEnabled(req.userEmail) };
  }

  /**
   * C4 (LAB-3318): the @mention picker search for members, teams and news. The result depends on the member, so it is
   * never cached.
   */
  @Get('mentions')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async mentions(@Query() query: unknown, @Req() req: { userEmail?: string }): Promise<LabosAgentMentionsResponse> {
    return this.agent.mentions(req.userEmail ?? '', validBody(LabosAgentMentionsQuerySchema, query, 'Invalid query'));
  }

  /** Same chunked JSON stream, headers and error handling as `POST /v1/husky/chat/contextual-tools`. */
  @Post('chat')
  @UseGuards(UserTokenValidation)
  async chat(@Body() body: unknown, @Req() req: { userEmail?: string }, @Res() res: Response) {
    const stream = await this.agent.chat(req.userEmail ?? '', validBody(LabosAgentChatRequestSchema, body));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // LAB-3367 h3: when the client stops the turn or disconnects before the end, cancel the stream. The turn then
    // writes no latest reply.
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abort.abort();
    };
    res.on('close', onClose);
    // The client can disconnect while `agent.chat` runs, before this listener exists.
    if (res.destroyed) abort.abort();
    try {
      await stream.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          },
        }),
        { signal: abort.signal }
      );
    } catch (error) {
      // Headers are on the wire, so an error response is impossible; abort the connection. LAB-3362: log the safe
      // fields only and destroy with no error, because an AI SDK APICallError holds the whole prompt. A client stop
      // is not a failure, so it gets no log line.
      if (!abort.signal.aborted) this.logger.error(`LabOS agent chat stream failed: ${logSafeError(error)}`);
      res.destroy();
    } finally {
      res.off('close', onClose);
    }
  }

  /** C2: confirm or cancel an action proposal from the chat. Only this route runs a write tool. */
  @Post('actions/confirm')
  @UseGuards(UserTokenValidation)
  async confirm(@Body() body: unknown, @Req() req: { userEmail?: string }): Promise<LabosAgentConfirmResponse> {
    return this.agent.confirm(req.userEmail ?? '', validBody(LabosAgentConfirmRequestSchema, body));
  }
}

/** The parsed body (or query), or 400 VALIDATION_ERROR. */
function validBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown, message = 'Invalid request body'): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      statusCode: 400,
      code: LABOS_AGENT_ERROR_CODES.VALIDATION_ERROR,
      message,
      errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return parsed.data;
}
