import { BadRequestException, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { MemberInterestProfilesQuerySchema } from 'libs/contracts/src/schema/member-interest-profile';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { MemberInterestProfileService } from './member-interest-profile.service';

/** Admin-only access to member interest profiles (LAB-3122), e.g. for the LAB-3124 pilot export. */
@Controller('v1/admin/member-interest-profiles')
@UseGuards(AdminAuthGuard)
@NoCache()
export class MemberInterestProfileController {
  constructor(private readonly profiles: MemberInterestProfileService) {}

  @Get()
  async getProfiles(@Query() query: Record<string, unknown>) {
    return this.profiles.readProfiles(parseQuery(query));
  }

  @Post('rebuild')
  @HttpCode(202)
  async rebuild() {
    return this.profiles.startAdminRebuild();
  }
}

function parseQuery(query: unknown) {
  try {
    return MemberInterestProfilesQuerySchema.parse(query);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new BadRequestException(err.errors.map((e) => `${e.path.join('.') || 'query'}: ${e.message}`).join('; '));
    }
    throw err;
  }
}
