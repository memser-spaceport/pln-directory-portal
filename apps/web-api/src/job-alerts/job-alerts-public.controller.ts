import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { UnsubscribeRequestSchema, VerifyRedirectRequestSchema } from 'libs/contracts/src/schema/job-alert';
import { NoCache } from '../decorators/no-cache.decorator';
import { JobAlertsService } from './job-alerts.service';
import { verifyJobAlertToken } from './job-alerts-token.util';

@Controller('v1/job-alerts')
export class JobAlertsPublicController {
  constructor(private readonly service: JobAlertsService) {}

  @Post('verify-redirect')
  @NoCache()
  async verifyRedirect(@Body() body: unknown) {
    const parsed = VerifyRedirectRequestSchema.parse(body);
    let payload;
    try {
      payload = verifyJobAlertToken(parsed.token, 'redirect');
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (!payload.applyUrl || !payload.jobUid) {
      throw new BadRequestException('Token missing required fields');
    }
    return {
      applyUrl: payload.applyUrl,
      alertUid: payload.alertUid,
      jobUid: payload.jobUid,
    };
  }

  @Post('unsubscribe')
  @NoCache()
  async unsubscribe(@Body() body: unknown) {
    const parsed = UnsubscribeRequestSchema.parse(body);
    return this.service.unsubscribeByToken(parsed.token);
  }
}
