import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateJobAlertSchema,
  UpdateJobAlertSchema,
} from 'libs/contracts/src/schema/job-alert';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { JobAlertsService } from './job-alerts.service';

@Controller('v1/job-alerts')
@UseGuards(UserAuthValidateGuard)
export class JobAlertsController {
  constructor(private readonly service: JobAlertsService) {}

  @Get()
  @NoCache()
  async list(@Req() req: any) {
    const memberUid = await this.service.resolveMemberUidByEmail(req.userEmail);
    return this.service.list(memberUid);
  }

  @Post()
  @NoCache()
  async create(@Req() req: any, @Body() body: unknown) {
    const memberUid = await this.service.resolveMemberUidByEmail(req.userEmail);
    const parsed = CreateJobAlertSchema.parse(body);
    return this.service.create(memberUid, parsed);
  }

  @Patch(':uid')
  @NoCache()
  async update(@Req() req: any, @Param('uid') uid: string, @Body() body: unknown) {
    const memberUid = await this.service.resolveMemberUidByEmail(req.userEmail);
    const parsed = UpdateJobAlertSchema.parse(body);
    return this.service.update(memberUid, uid, parsed);
  }

  @Delete(':uid')
  @HttpCode(204)
  @NoCache()
  async delete(@Req() req: any, @Param('uid') uid: string): Promise<void> {
    const memberUid = await this.service.resolveMemberUidByEmail(req.userEmail);
    await this.service.delete(memberUid, uid);
  }
}
