import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AiAppsResourcesAdminAuthGuard } from '../guards/admin-auth.guard';
import { AiAppResourcesService } from './ai-app-resources.service';
import {
  AiAppEnvironmentSchema,
  UpdateAiAppResourcesDto,
} from './dto/ai-app-resources.dto';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/admin/ai-app-resources')
@UseGuards(AiAppsResourcesAdminAuthGuard)
export class AiAppResourcesController {
  constructor(
    private readonly resources: AiAppResourcesService,
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
  @UsePipes(ZodValidationPipe)
  update(
    @Param('appId') appId: string,
    @Query('environment') environment: string,
    @Body() body: UpdateAiAppResourcesDto,
  ) {
    return this.resources.update(
      appId,
      AiAppEnvironmentSchema.parse(environment),
      body,
    );
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
