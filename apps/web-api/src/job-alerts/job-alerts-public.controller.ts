import { BadRequestException, Body, Controller, NotFoundException, Post } from '@nestjs/common';
import {
  UnsubscribeRequestSchema,
  VerifyRedirectRequestSchema,
} from 'libs/contracts/src/schema/job-alert';
import { NoCache } from '../decorators/no-cache.decorator';
import { PrismaService } from '../shared/prisma.service';
import { verifyJobAlertToken } from './job-alerts-token.util';

@Controller('v1/job-alerts')
export class JobAlertsPublicController {
  constructor(private readonly prisma: PrismaService) {}

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
    let payload;
    try {
      payload = verifyJobAlertToken(parsed.token, 'unsubscribe');
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const alert = await this.prisma.jobAlert.findFirst({
      where: { uid: payload.alertUid, deletedAt: null },
      select: { uid: true, name: true, filterStateHash: true },
    });
    if (!alert) {
      throw new NotFoundException('Job alert not found');
    }
    await this.prisma.jobAlert.update({
      where: { uid: alert.uid },
      data: {
        deletedAt: new Date(),
        filterStateHash: `${alert.filterStateHash}#deleted:${alert.uid}`,
      },
    });
    return { alertUid: alert.uid, alertName: alert.name };
  }
}
