import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { applyDecorators } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ZodType, ZodTypeDef } from 'zod';
import {
  LabosDigestNewsQuerySchema,
  LabosDigestSendListSchema,
  LabosDigestSendSchema,
  LabosDigestSendsQuerySchema,
  LabosDigestServiceNewsResponseSchema,
  LabosDigestViewSchema,
} from 'libs/contracts/src/schema/team-news';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { LabosDigestService } from './labos-digest.service';

/** The global throttler skips v1/service. This limit applies only to the newsletter read API. */
export const LABOS_DIGEST_SERVICE_THROTTLE_LIMIT = 60;
export const LABOS_DIGEST_SERVICE_THROTTLE_TTL_SECONDS = 60;

const serviceDocs = (schema: ZodType) =>
  applyDecorators(
    ApiOkResponseFromZod(schema),
    ApiUnauthorizedResponse({ description: 'Missing or wrong service key.' }),
    ApiTooManyRequestsResponse({ description: 'Rate limit exceeded. 60 requests per 60 seconds.' })
  );

@ApiTags('LabOS Digest - Service')
@Controller('v1/service/labos-digest')
@UseGuards(ServiceAuthGuard, ThrottlerGuard)
@Throttle(LABOS_DIGEST_SERVICE_THROTTLE_LIMIT, LABOS_DIGEST_SERVICE_THROTTLE_TTL_SECONDS)
export class LabosDigestServiceController {
  constructor(private readonly labosDigest: LabosDigestService) {}

  @Get('top-stories')
  @NoCache()
  @serviceDocs(LabosDigestViewSchema)
  topStories() {
    return this.labosDigest.getView();
  }

  @Get('news')
  @NoCache()
  @serviceDocs(LabosDigestServiceNewsResponseSchema)
  news(@Query() query: Record<string, unknown>) {
    return this.labosDigest.listServiceNews(parseInput(LabosDigestNewsQuerySchema, query));
  }

  @Get('sends')
  @NoCache()
  @serviceDocs(LabosDigestSendListSchema)
  sends(@Query() query: Record<string, unknown>) {
    return this.labosDigest.listSends(parseInput(LabosDigestSendsQuerySchema, query));
  }

  @Get('sends/:uid')
  @NoCache()
  @serviceDocs(LabosDigestSendSchema)
  send(@Param('uid') uid: string) {
    return this.labosDigest.getSend(uid);
  }
}

function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }
  return parsed.data;
}
