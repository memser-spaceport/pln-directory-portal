import { ArgumentsHost, Catch, HttpException, Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { LogException } from '../filters/log-exception.filter';

/**
 * LabOS agent error bodies keep their `code` (LAB-3300, contract C1 and C2).
 * The global `LogException` rebuilds every HttpException body as `{ statusCode, message, reason? }`, so it drops
 * `code` and fields such as the 409 `status`. This filter is scoped to the LabOS agent controller. An HttpException
 * whose body has a string `code` goes out as-is. Every other HttpException gets the `LogException` behavior.
 * Other exceptions do not reach this filter, so the global filters handle them as before.
 */
@Catch(HttpException)
@Injectable()
export class LabosAgentExceptionFilter extends LogException {
  private readonly agentLogger = new Logger();

  async catch(exception: HttpException, host: ArgumentsHost) {
    const body = exception.getResponse();
    if (!hasCode(body)) return super.catch(exception, host);
    console.log('global exception filter', exception);
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(body);
    this.agentLogger.error('error', exception);
  }
}

function hasCode(body: unknown): body is { code: string } {
  return typeof body === 'object' && body !== null && typeof (body as { code?: unknown }).code === 'string';
}
