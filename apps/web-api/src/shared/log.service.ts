import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LogService {
  @Inject()
  private readonly logger: Logger;

  info(message: string, context?: string) {
    this.logger.log('info', message, context);
  }
  error(message: any, stack?: string, context?: string) {
    this.logger.log('error', message, stack, context);
  }
}
