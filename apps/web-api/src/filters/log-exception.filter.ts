import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { LogService } from '../shared/log.service';

@Catch(HttpException)
export class LogException implements ExceptionFilter {
  @Inject()
  private readonly logger: LogService;
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const errorResponse: any = exception.getResponse();

    this.logger.error(
      `${exception.getStatus()} - ${exception.message}`,
      exception?.stack
    );
    response.status(status).json({
      ...errorResponse,
    });
  }
}
