import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LogService {
  @Inject()
  private readonly logger: Logger;

  info(message: string, context?: string) {
    this.logger.log('info', JSON.stringify(message), context);
  }
  error(message: any, stack?: string, context?: string) {
    console.log("Error -------")
    console.log(message)
    this.logger.log('error', JSON.stringify(message), stack, context);
  }
}
