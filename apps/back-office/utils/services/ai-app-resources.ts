import api from '../api';
import { API_ROUTE } from '../constants';
import type {
  AccessControlPermission,
  AiAppAudienceResponse,
  AiAppAudienceUpdate,
  AiAppDeployment,
  AiAppDeploymentsResponse,
  AiAppResourcesResponse,
  AiAppResourceValues,
  AiAppTarget,
} from '../../screens/ai-app-resources/types';

interface AuthParams {
  authToken: string | undefined;
}

const authHeaders = (authToken: string | undefined) => ({ authorization: `Bearer ${authToken}` });

const resourceUrl = (appId: string) => `${API_ROUTE.ADMIN_AI_APP_RESOURCES}/${encodeURIComponent(appId)}`;

const audienceUrl = (appId: string) => `${API_ROUTE.ADMIN_AI_APP_AUDIENCE}/${encodeURIComponent(appId)}`;

export async function fetchAiAppsList(params: AuthParams): Promise<AiAppDeployment[]> {
  const response = await api.get<AiAppDeploymentsResponse>(API_ROUTE.ADMIN_AI_APP_RESOURCES, {
    headers: authHeaders(params.authToken),
  });
  return response.data?.apps ?? [];
}

export async function fetchAiAppResources(params: AuthParams & AiAppTarget): Promise<AiAppResourcesResponse> {
  const response = await api.get<AiAppResourcesResponse>(resourceUrl(params.appId), {
    headers: authHeaders(params.authToken),
    params: { environment: params.environment },
  });
  return response.data;
}

export async function updateAiAppResources(
  params: AuthParams & AiAppTarget & { resources: AiAppResourceValues }
): Promise<unknown> {
  const response = await api.put(resourceUrl(params.appId), params.resources, {
    headers: authHeaders(params.authToken),
    params: { environment: params.environment },
  });
  return response.data;
}

export async function resetAiAppResources(params: AuthParams & AiAppTarget): Promise<{ deleted: boolean }> {
  const response = await api.delete<{ deleted: boolean }>(resourceUrl(params.appId), {
    headers: authHeaders(params.authToken),
    params: { environment: params.environment },
  });
  return response.data;
}

export async function fetchAiAppAudience(params: AuthParams & { appId: string }): Promise<AiAppAudienceResponse> {
  const response = await api.get<AiAppAudienceResponse>(audienceUrl(params.appId), {
    headers: authHeaders(params.authToken),
  });
  return response.data;
}

export async function updateAiAppAudience(
  params: AuthParams & { appId: string } & AiAppAudienceUpdate
): Promise<AiAppAudienceResponse> {
  const { authToken, appId, ...body } = params;
  const response = await api.put<AiAppAudienceResponse>(audienceUrl(appId), body, { headers: authHeaders(authToken) });
  return response.data;
}

/** Access Control V2 permissions an app can be published to. */
export async function fetchAccessControlPermissions(params: AuthParams): Promise<AccessControlPermission[]> {
  const response = await api.get<AccessControlPermission[]>(API_ROUTE.ADMIN_ACCESS_CONTROL_V2_PERMISSIONS, {
    headers: authHeaders(params.authToken),
  });
  return response.data ?? [];
}

/** Uploads an app icon through the admin image upload and returns its URL. */
export async function uploadAiAppIcon(params: AuthParams & { file: File }): Promise<string> {
  const body = new FormData();
  body.append('file', params.file);
  const response = await api.post(API_ROUTE.ADMIN_IMAGES, body, {
    headers: { ...authHeaders(params.authToken), 'content-type': 'multipart/form-data' },
  });
  const image = response.data?.image ?? response.data;
  if (!image?.url) {
    throw new Error('The upload did not return an image URL');
  }
  return image.url as string;
}
