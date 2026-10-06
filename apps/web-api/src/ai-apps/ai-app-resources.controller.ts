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
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RequirePermissions } from '../rbac/rbac.decorator';
import { RbacGuard } from '../rbac/rbac.guard';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AiAppResourcesService } from './ai-app-resources.service';
import {
  AiAppEnvironmentSchema,
  UpdateAiAppResourcesDto,
} from './dto/ai-app-resources.dto';

const MANAGE_RESOURCES = {
  allOf: [AI_APPS_PERMISSIONS.RESOURCES_MANAGE],
};

@Controller('v1/admin/ai-app-resources')
@UseGuards(UserTokenCheckGuard, RbacGuard)
@RequirePermissions(MANAGE_RESOURCES)
export class AiAppResourcesController {
  constructor(
    private readonly resources: AiAppResourcesService,
  ) {}

  @Get()
  list() {
    return this.resources.list();
  }

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
