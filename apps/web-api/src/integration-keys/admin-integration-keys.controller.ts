import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { IntegrationKeysService } from './integration-keys.service';
import { CreateIntegrationKeyRequestDto, ListIntegrationKeysQueryDto } from './integration-keys.dto';

/**
 * Directory-admin management of team-scoped integration keys. The plaintext key
 * is in the create response and nowhere else; list and revoke never return it.
 */
@ApiTags('Admin Integration Keys')
@Controller('v1/admin/integration-keys')
@UseGuards(AdminAuthGuard)
@NoCache()
export class AdminIntegrationKeysController {
  constructor(private readonly integrationKeys: IntegrationKeysService) {}

  @Post()
  async create(@Body(new ZodValidationPipe()) body: CreateIntegrationKeyRequestDto, @Req() req: Record<string, any>) {
    return this.integrationKeys.issue({
      teamUid: body.teamUid,
      name: body.name,
      scopes: body.scopes,
      createdByUid: req?.user?.memberUid ?? null,
    });
  }

  @Get()
  async list(@Query(new ZodValidationPipe()) query: ListIntegrationKeysQueryDto) {
    return this.integrationKeys.listForTeam(query.teamUid);
  }

  @Delete(':uid')
  async revoke(@Param('uid') uid: string) {
    return this.integrationKeys.revoke(uid);
  }
}
