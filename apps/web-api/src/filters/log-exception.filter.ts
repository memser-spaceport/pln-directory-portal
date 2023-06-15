import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { LogService } from '../shared/log.service';

@Catch()
export class LogException implements ExceptionFilter {
  @Inject()
  private readonly logger: LogService;
  catch(exception: any, host: ArgumentsHost) {
    this.logger.error(
      exception.response ? exception.response.message : exception.message,
      exception
    );
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      typeof exception.getStatus === 'function' ? exception.getStatus() : 500;
    const message =
      typeof exception.getStatus === 'function'
        ? (exception?.response?.message ? exception.response.message : exception.message)
        : 'Internal error, contact support';
    response.status(status).json({
      message,
      errors: exception.error,
      timestamp: new Date().toISOString(),
      path: request.url,
      statusCode: status,
    });
  }
}
