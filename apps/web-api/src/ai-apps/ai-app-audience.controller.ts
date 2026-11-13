import { Body, Controller, Get, Param, Put, Req, UseGuards, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AiAppsAudienceService } from './ai-apps-audience.service';
import { UpdateAiAppAudienceDto } from './dto/ai-app-audience.dto';

type AudienceAdminRequest = { user?: { memberUid?: string; uid?: string } };

/**
 * Back Office: publish an AI App to members outside PL Infra, by policy (LAB-3200). Directory admins only.
 * A saved audience applies on the next request to the app; an empty one takes the app back.
 */
@Controller('v1/admin/ai-app-audience')
@UseGuards(AdminAuthGuard)
export class AiAppAudienceController {
  constructor(private readonly audienceService: AiAppsAudienceService) {}

  @NoCache()
  @Get(':appId')
  get(@Param('appId') appId: string) {
    return this.audienceService.getAudience(appId);
  }

  @Put(':appId')
  @UsePipes(ZodValidationPipe)
  update(@Param('appId') appId: string, @Body() body: UpdateAiAppAudienceDto, @Req() req: AudienceAdminRequest) {
    const actorUid = req.user?.memberUid ?? req.user?.uid ?? 'unknown';
    return this.audienceService.updateAudience(actorUid, appId, body.policyCodes);
  }
}
