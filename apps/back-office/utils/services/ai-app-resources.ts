import api from '../api';
import { API_ROUTE } from '../constants';
import type {
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
