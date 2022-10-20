import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { NotFoundError } from '@prisma/client/runtime';
import { Response } from 'express';

@Catch(NotFoundError)
/* Filter that catches NotFoundError exceptions and returns a 404 response */
export class NotFoundExceptionFilter implements ExceptionFilter {
  public catch(exception: NotFoundError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    return response.status(404).json({ statusCode: 404, error: 'Not Found' });
  }
}
