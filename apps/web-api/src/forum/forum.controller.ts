import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { extractTokenFromRequest } from '../utils/auth';
import { ProtosphereApiClient } from './protosphere-api.client';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { ForumAccessResponseSchema } from 'libs/contracts/src/schema/forum';
import { NoCache } from '../decorators/no-cache.decorator';

@ApiTags('Forum')
@Controller('v1/forum')
export class ForumController {
  constructor(private readonly protosphereApiClient: ProtosphereApiClient) {}

  @Get('check-group-access')
  @ApiOkResponseFromZod(ForumAccessResponseSchema)
  @NoCache()
  async checkAccess(@Req() request: Request) {
    const token = extractTokenFromRequest(request);
    if (!token) {
      return { hasAccess: false };
    }

    try {
      const hasAccess = await this.protosphereApiClient.isGroupMember(token);
      return { hasAccess };
    } catch (error) {
      // If there's an error checking access, assume no access
      return { hasAccess: false };
    }
  }
}
