import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LogService {
  @Inject()
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger(); // Initialize logger
  }

  info(message: string, context?: string) {
    this.logger.log('info', JSON.stringify(message), context);
  }
  error(message: any, stack?: string, context?: string) {
    this.logger.error(JSON.stringify(message), stack, context);
  }
}
