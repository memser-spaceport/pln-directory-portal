import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { NotFoundError } from '@prisma/client/runtime';
import { Response } from 'express';
import { NOT_FOUND_GLOBAL_ERROR_RESPONSE } from '../utils/constants';

@Catch(NotFoundError)
/* Filter that catches NotFoundError exceptions and returns a 404 response */
export class NotFoundExceptionFilter implements ExceptionFilter {
  public catch(exception: NotFoundError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    return response.status(404).json(NOT_FOUND_GLOBAL_ERROR_RESPONSE);
  }
}
