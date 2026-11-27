import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { eventIssuesMessage } from 'libs/contracts/src/schema/pl-event-body';
import { PLEventBatchBodySchema, PLEventDecisionBodySchema } from 'libs/contracts/src/schema/pl-event-curation';
import { NoCache } from '../decorators/no-cache.decorator';
import { RequireIntegrationScopes } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { ImagesService } from '../images/images.service';
import type { IntegrationKeyRequestContext } from '../integration-keys/integration-keys.service';
import { PLEventCurationService } from './pl-event-curation.service';

type IntegrationRequest = { integrationKey: IntegrationKeyRequestContext };

/**
 * The curation API for partner event apps (LAB-3326), for a team-scoped integration key with an events scope:
 * `events:read` to read events in every status, `events:write` to decide on them and to publish and maintain the
 * app's own events. A member token is not accepted. See `docs/EVENTS_CURATION_API.md`.
 *
 * Exempt from the member rate limiter, like the other integration routes. An invalid body answers 422.
 */
@ApiTags('Integrations - Events')
@Controller('v1/integrations/events')
@UseGuards(IntegrationKeyGuard)
@SkipThrottle()
@NoCache()
export class PLEventCurationController {
  constructor(private readonly curation: PLEventCurationService, private readonly imagesService: ImagesService) {}

  /** Events in every status but draft, oldest change first: `status`, `updatedSince`, `cursor`, `limit`. */
  @Get()
  @RequireIntegrationScopes('events:read')
  async list(@Query() query: Record<string, unknown>, @Req() req: IntegrationRequest) {
    return await this.curation.list(req.integrationKey.teamUid, query);
  }

  /** Publish up to 100 events by the app's own ids. One result per event, in order. */
  @Post('batch')
  @HttpCode(200)
  @RequireIntegrationScopes('events:write')
  async batch(@Body() body: unknown, @Req() req: IntegrationRequest) {
    const parsed = PLEventBatchBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new UnprocessableEntityException(eventIssuesMessage(parsed.error.issues));
    }
    return { results: await this.curation.upsertBatch(req.integrationKey.teamUid, parsed.data.events) };
  }

  /** Upload one event image; use the returned `uid` as `logoUid`. */
  @Post('images')
  @HttpCode(200)
  @RequireIntegrationScopes('events:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new UnprocessableEntityException('Send the image as the multipart field "file"');
    }
    const { image } = await this.imagesService.upload(file);
    return { uid: image.uid, url: image.url };
  }

  /** Create or update the event the app knows as `externalId`. */
  @Put('by-external-id/:externalId')
  @RequireIntegrationScopes('events:write')
  async upsert(@Param('externalId') externalId: string, @Body() body: unknown, @Req() req: IntegrationRequest) {
    return await this.curation.upsert(req.integrationKey.teamUid, externalId, body);
  }

  /** Approve or reject any event. Rejecting an approved event hides it. */
  @Post(':uid/decision')
  @HttpCode(200)
  @RequireIntegrationScopes('events:write')
  async decide(@Param('uid') uid: string, @Body() body: unknown, @Req() req: IntegrationRequest) {
    const parsed = PLEventDecisionBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new UnprocessableEntityException(eventIssuesMessage(parsed.error.issues));
    }
    await this.curation.decide(uid, parsed.data.status, parsed.data.note);
    return await this.curation.item(uid, req.integrationKey.teamUid);
  }

  /** Correct the fields of any event. The status and the submitter do not change. */
  @Patch(':uid')
  @RequireIntegrationScopes('events:write')
  async patch(@Param('uid') uid: string, @Body() body: unknown, @Req() req: IntegrationRequest) {
    await this.curation.patch(req.integrationKey.teamUid, uid, body);
    return await this.curation.item(uid, req.integrationKey.teamUid);
  }

  /** Delete an event the key's team published. */
  @Delete(':uid')
  @RequireIntegrationScopes('events:write')
  async delete(@Param('uid') uid: string, @Req() req: IntegrationRequest) {
    await this.curation.delete(req.integrationKey.teamUid, uid);
    return { uid, deleted: true };
  }
}
