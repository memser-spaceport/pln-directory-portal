import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { SentryInterceptor } from './interceptor/sentry.interceptor';

@UseInterceptors(SentryInterceptor)
@Controller()
export class AppController {
  /*
   ** We have this so we don't have a 404 on the root path
   */
  @Get()
  getHello(): string {
    return 'Protocol labs API';
  }
}
