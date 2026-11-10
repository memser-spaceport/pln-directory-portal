import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { applyDecorators } from '@nestjs/common';
import { ZodType, ZodTypeDef } from 'zod';
import {
  LabosDigestFoundNewsResponseSchema,
  LabosDigestNewsDetailSchema,
  LabosDigestNewsQuerySchema,
  LabosDigestViewSchema,
  PostLabosDigestNewsSchema,
  SaveLabosDigestPicksSchema,
  UpdateLabosDigestNewsSchema,
} from 'libs/contracts/src/schema/team-news';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { LabosDigestService } from './labos-digest.service';

type AdminRequest = { user?: { memberUid?: string } };

const adminDocs = (schema: ZodType) =>
  applyDecorators(
    ApiOkResponseFromZod(schema),
    ApiUnauthorizedResponse({ description: 'Missing or invalid admin token.' }),
    ApiForbiddenResponse({ description: 'Caller is not a directory admin.' })
  );

@ApiTags('LabOS Digest - Admin')
@Controller('v1/admin/labos-digest')
@UseGuards(AdminAuthGuard)
export class LabosDigestAdminController {
  constructor(private readonly labosDigest: LabosDigestService) {}

  @Get()
  @NoCache()
  @adminDocs(LabosDigestViewSchema)
  getView() {
    return this.labosDigest.getView();
  }

  @Put('picks')
  @adminDocs(LabosDigestViewSchema)
  savePicks(@Body() body: unknown, @Req() request: AdminRequest) {
    const { newsItemUids } = parseInput(SaveLabosDigestPicksSchema, body);
    return this.labosDigest.savePicks(newsItemUids, request.user?.memberUid ?? null);
  }

  @Delete('picks')
  @adminDocs(LabosDigestViewSchema)
  resetPicks() {
    return this.labosDigest.resetPicks();
  }

  @Get('news')
  @NoCache()
  @adminDocs(LabosDigestFoundNewsResponseSchema)
  listNews(@Query() query: Record<string, unknown>) {
    return this.labosDigest.listFoundNews(parseInput(LabosDigestNewsQuerySchema, query));
  }

  @Get('news/:uid')
  @NoCache()
  @adminDocs(LabosDigestNewsDetailSchema)
  getNews(@Param('uid') uid: string) {
    return this.labosDigest.getNewsItem(uid);
  }

  @Patch('news/:uid')
  @adminDocs(LabosDigestNewsDetailSchema)
  updateNews(@Param('uid') uid: string, @Body() body: unknown) {
    return this.labosDigest.updateNewsItem(uid, parseInput(UpdateLabosDigestNewsSchema, body));
  }

  @Post('news')
  @adminDocs(LabosDigestNewsDetailSchema)
  postNews(@Body() body: unknown, @Req() request: AdminRequest) {
    const memberUid = request.user?.memberUid;
    if (!memberUid) {
      throw new BadRequestException('Admin token has no member');
    }
    return this.labosDigest.postNews(parseInput(PostLabosDigestNewsSchema, body), memberUid);
  }
}

function parseInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }
  return parsed.data;
}
