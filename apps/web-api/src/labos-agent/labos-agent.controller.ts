import { BadRequestException, Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ZodType, ZodTypeDef } from 'zod';
import {
  LABOS_AGENT_ERROR_CODES,
  LabosAgentAccessResponse,
  LabosAgentChatRequestSchema,
  LabosAgentConfirmRequestSchema,
  LabosAgentConfirmResponse,
} from 'libs/contracts/src/schema/labos-agent';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { LabosAgentService } from './labos-agent.service';

/** LabOS in-app agent, contracts C1 and C2 (LAB-3272; slices S1 LAB-3298, S2 LAB-3299). */
@Controller('v1/labos-agent')
export class LabosAgentController {
  constructor(private readonly agent: LabosAgentService) {}

  /** The frontend shows the agent dock only when this is true. Never 403. */
  @Get('access')
  @UseGuards(UserTokenValidation)
  async access(@Req() req: { userEmail?: string }): Promise<LabosAgentAccessResponse> {
    return { enabled: await this.agent.isEnabled(req.userEmail) };
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
    try {
      await stream.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          },
        })
      );
    } catch (error) {
      // Headers are on the wire, so an error response is impossible; abort the connection.
      res.destroy(error);
    }
  }

  /** C2: confirm or cancel an action proposal from the chat. Only this route runs a write tool. */
  @Post('actions/confirm')
  @UseGuards(UserTokenValidation)
  async confirm(@Body() body: unknown, @Req() req: { userEmail?: string }): Promise<LabosAgentConfirmResponse> {
    return this.agent.confirm(req.userEmail ?? '', validBody(LabosAgentConfirmRequestSchema, body));
  }
}

/** The parsed body, or 400 VALIDATION_ERROR. */
function validBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      statusCode: 400,
      code: LABOS_AGENT_ERROR_CODES.VALIDATION_ERROR,
      message: 'Invalid request body',
      errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return parsed.data;
}
