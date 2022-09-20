import { Controller, UseInterceptors } from '@nestjs/common';
import { SentryInterceptor } from './interceptor/sentry.interceptor';

@UseInterceptors(SentryInterceptor)
@Controller()
export class AppController {}
