import {
  ArgumentsHost,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import axios, { AxiosError } from 'axios';

@Injectable()
export class LogException extends BaseExceptionFilter {
  private readonly logger = new Logger();

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof PrismaClientKnownRequestError) {
      // Handle Prisma errors
      const statusCode = 500;
      const message = 'Unexpected error. Please try again.';
      response.status(statusCode).json({
        statusCode,
        message,
      });
    } else if (axios.isAxiosError(exception)) {
      // Handle Axios errors
      const axiosError = exception as AxiosError;
      const statusCode = axiosError.response?.status || 500;
      const message = 'Unexpected error. Please try again.';
      response.status(statusCode).json({
        statusCode,
        message,
      });
    } else if (exception instanceof HttpException) {
      // Handle NestJS errors
      const status = exception.getStatus();
      const responseObj = exception.getResponse();
      const message =
        typeof responseObj === 'string' ? responseObj : exception.message;
      response.status(status).json({
        statusCode: status,
        message,
      });
    } else {
      // Handle all other errors
      const statusCode = 500;
      const message = 'Unexpected Error. Please try again.';
      response.status(statusCode).json({
        statusCode,
        message,
      });
    }

    console.log(
      'Cloud watch env',
      process.env.CLOUDWATCH_GROUP_NAME,
      process.env.CLOUDWATCH_ACCESS_KEY,
      process.env.CLOUDWATCH_SECRET_KEY,
      process.env.CLOUDWATCH_REGION,
      process.env.DEPLOYMENT_ENVIRONMENT,
      process.env.NODE_ENV
    );

    // Log the error.
    this.logger.error('error', exception);
  }
}
