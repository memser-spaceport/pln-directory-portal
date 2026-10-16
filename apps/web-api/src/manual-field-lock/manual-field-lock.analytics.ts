import { ArgumentsHost, Catch, ExceptionFilter, Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { ManualFieldSubject, PatchManualFieldsDto, PatchManualFieldsResult } from './manual-field-lock.service';

const SERVICE_DISTINCT_ID = 'service:investor-db';

type PatchRequest = {
  url?: string;
  params?: { uid?: string };
};

function compact(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
}

function fieldCountOf(fields: unknown): number | undefined {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return undefined;
  return Object.keys(fields).length;
}

function actorUidOf(dto: PatchManualFieldsDto | undefined): string | undefined {
  const uid = dto?.actor?.uid;
  if (typeof uid !== 'string') return undefined;
  const trimmed = uid.trim();
  return trimmed || undefined;
}

function errorKindOf(error: unknown): string {
  if (error instanceof Error && error.constructor?.name) {
    return error.constructor.name;
  }
  return 'Error';
}

export function subjectTypeFromRequest(request: PatchRequest): ManualFieldSubject | undefined {
  const path = (request.url ?? '').split('?')[0];
  if (path.includes('/warm-intros-v2/edges/')) return 'connection_edge';
  if (path.includes('/warm-intros-v2/paths/')) return 'warm_path_v2';
  if (path.includes('/master-profiles/')) return 'master_profile';
  return undefined;
}

export function manualFieldsAuthReason(exception: UnauthorizedException): string {
  const response = exception.getResponse();
  const message = typeof response === 'string' ? response : (response as { message?: unknown }).message;
  const text = Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : '';
  if (text.includes('not configured')) return 'unconfigured';
  if (text.includes('Missing authorization')) return 'missing';
  if (text.includes('Invalid authorization type')) return 'invalid_type';
  if (text.includes('Invalid service credentials')) return 'invalid_credentials';
  return 'unauthorized';
}

export async function trackServiceManualFieldsPatch(
  analytics: AnalyticsService,
  subjectType: ManualFieldSubject,
  uid: string,
  dto: PatchManualFieldsDto | undefined,
  run: () => Promise<PatchManualFieldsResult>
): Promise<PatchManualFieldsResult> {
  const actorUid = actorUidOf(dto);
  const shared = compact({
    subjectType,
    uid: uid.trim() || undefined,
    fieldCount: fieldCountOf(dto?.fields),
    actorUid,
  });
  try {
    const result = await run();
    void analytics.trackEvent({
      name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCHED,
      distinctId: actorUid ?? SERVICE_DISTINCT_ID,
      properties: compact({
        ...shared,
        lockedCount: result.locked.length,
        unlockedCount: result.unlocked.length,
      }),
    });
    return result;
  } catch (error) {
    void analytics.trackEvent({
      name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCH_FAILED,
      distinctId: actorUid ?? SERVICE_DISTINCT_ID,
      properties: compact({
        ...shared,
        errorKind: errorKindOf(error),
      }),
    });
    throw error;
  }
}

@Catch(UnauthorizedException)
@Injectable()
export class ManualFieldsPatchAuthFilter implements ExceptionFilter {
  constructor(private readonly analytics: AnalyticsService) {}

  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<PatchRequest>();
    const uid = typeof request.params?.uid === 'string' ? request.params.uid.trim() : '';
    void this.analytics.trackEvent({
      name: ANALYTICS_EVENTS.INVESTOR_DB.MANUAL_FIELDS_PATCH_UNAUTHORIZED,
      distinctId: SERVICE_DISTINCT_ID,
      properties: compact({
        subjectType: subjectTypeFromRequest(request),
        uid: uid || undefined,
        reason: manualFieldsAuthReason(exception),
      }),
    });
    const response = http.getResponse<Response>();
    const body = exception.getResponse();
    response.status(exception.getStatus()).json(typeof body === 'string' ? { statusCode: 401, message: body } : body);
  }
}
