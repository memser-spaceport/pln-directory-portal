import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { AiAppsResourcesAdminAuthGuard } from '../guards/admin-auth.guard';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { AiAppResourcesService } from './ai-app-resources.service';
import {
  AiAppEnvironmentSchema,
  AiAppResourcesSchema,
} from './dto/ai-app-resources.dto';
import { NoCache } from '../decorators/no-cache.decorator';

type ResourcesAdminRequest = { user?: { memberUid?: string; uid?: string } };

@Controller('v1/admin/ai-app-resources')
@UseGuards(AiAppsResourcesAdminAuthGuard)
export class AiAppResourcesController {
  constructor(
    private readonly resources: AiAppResourcesService,
    private readonly analytics: AnalyticsService,
  ) {}

  @NoCache()
  @Get()
  list() {
    return this.resources.list();
  }

  @NoCache()
  @Get(':appId')
  get(
    @Param('appId') appId: string,
    @Query('environment') environment: string,
  ) {
    return this.resources.get(
      appId,
      AiAppEnvironmentSchema.parse(environment),
    );
  }

  @Put(':appId')
  async update(
    @Param('appId') appId: string,
    @Query('environment') environment: string,
    @Body() body: unknown,
    @Req() req: ResourcesAdminRequest,
  ) {
    const memberUid = req.user?.memberUid ?? req.user?.uid ?? 'unknown';
    const parsed = AiAppResourcesSchema.safeParse(body);
    if (!parsed.success) {
      this.trackResources(ANALYTICS_EVENTS.AI_APPS.RESOURCES_SAVE_REJECTED, memberUid, {
        appId,
        reason: 'validation',
      });
      const message = parsed.error.errors
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new UnprocessableEntityException(`Input validation failed: ${message}`);
    }

    let environmentValue: string;
    try {
      environmentValue = AiAppEnvironmentSchema.parse(environment);
    } catch (error) {
      this.trackResources(ANALYTICS_EVENTS.AI_APPS.RESOURCES_SAVE_REJECTED, memberUid, {
        appId,
        reason: 'validation',
      });
      throw error;
    }

    try {
      const result = await this.resources.update(appId, environmentValue, parsed.data);
      this.trackResources(ANALYTICS_EVENTS.AI_APPS.RESOURCES_SAVED, memberUid, {
        appId,
        environment: environmentValue,
      });
      return result;
    } catch (error) {
      this.trackResources(ANALYTICS_EVENTS.AI_APPS.RESOURCES_SAVE_REJECTED, memberUid, {
        appId,
        environment: environmentValue,
        reason: 'apply',
      });
      throw error;
    }
  }

  private trackResources(name: string, memberUid: string, properties: Record<string, unknown>) {
    void this.analytics.trackEvent({
      name,
      distinctId: memberUid,
      properties: { memberUid, ...properties },
    });
  }

  @Delete(':appId')
  remove(
    @Param('appId') appId: string,
    @Query('environment') environment: string,
  ) {
    return this.resources.remove(
      appId,
      AiAppEnvironmentSchema.parse(environment),
    );
  }
}
