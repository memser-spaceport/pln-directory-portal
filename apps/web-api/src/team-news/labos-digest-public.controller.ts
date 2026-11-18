import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ZodType, ZodTypeDef } from 'zod';
import {
  LabosDigestChoiceRequestSchema,
  LabosDigestChoiceResponseSchema,
  LabosDigestPageRequestSchema,
  LabosDigestPageSchema,
} from 'libs/contracts/src/schema/team-news';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';
import { DigestLinkError } from './labos-digest-link-token.util';
import { LabosDigestPageService } from './labos-digest-page.service';

/**
 * The public digest page (LAB-3263). No sign-in: the signed link token in the body is the only credential, and
 * it names the member. POST keeps the token out of access logs and caches. The global throttler applies.
 */
@ApiTags('LabOS Digest - Page')
@Controller('v1/labos-digest')
export class LabosDigestPublicController {
  constructor(private readonly page: LabosDigestPageService) {}

  @Post('page')
  @HttpCode(200)
  @NoCache()
  @ApiOkResponseFromZod(LabosDigestPageSchema)
  @ApiUnauthorizedResponse({ description: 'The link is broken, expired or not signed by LabOS.' })
  async read(@Body() body: unknown) {
    const { token, issue } = parseInput(LabosDigestPageRequestSchema, body);
    return withLinkErrors(() => this.page.read(token, issue));
  }

  @Post('choices')
  @HttpCode(200)
  @NoCache()
  @ApiOkResponseFromZod(LabosDigestChoiceResponseSchema)
  @ApiUnauthorizedResponse({ description: 'The link is broken, expired or not signed by LabOS.' })
  async choose(@Body() body: unknown) {
    const { token, newsItemUid, choice, issue } = parseInput(LabosDigestChoiceRequestSchema, body);
    return withLinkErrors(() => this.page.choose(token, newsItemUid, choice, issue));
  }
}

/** A bad link is 401 with its reason (`expired` lets the page say so); a missing secret is 503. */
async function withLinkErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof DigestLinkError)) throw error;
    if (error.reason === 'no-secret') {
      throw new ServiceUnavailableException({ message: 'Digest links are not set up', reason: error.reason });
    }
    throw new UnauthorizedException({ message: 'This digest link is not valid', reason: error.reason });
  }
}

function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }
  return parsed.data;
}
