import { Controller, Get, Req, UseInterceptors } from '@nestjs/common';
import { NoCache } from './decorators/no-cache.decorator';
import { SentryInterceptor } from './interceptors/sentry.interceptor';

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

  /**
   * Retrieve a CSRF token
   */
  @Get('/token')
  @NoCache()
  getCsrfToken(@Req() req): any {
    return {
      token: req.csrfToken(),
    };
  }
}
