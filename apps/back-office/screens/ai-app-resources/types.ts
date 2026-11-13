export interface AiAppDeployment {
  app_id: string;
  environment: string;
  release_name: string | null;
  deployment_id: string | null;
  s3_key: string | null;
  status: string | null;
  host: string | null;
  image: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AiAppDeploymentsResponse {
  apps: AiAppDeployment[];
}

export interface AiAppResourceValues {
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
}

export interface AiAppResourcesResponse {
  appId: string;
  environment: string;
  override: AiAppResourceValues | null;
}

export interface AiAppTarget {
  appId: string;
  environment: string;
}

export interface AiAppAudienceResponse {
  appUid: string;
  appId: string;
  name: string;
  /** RBAC policy codes whose holders can open the app. Empty means PL Infra only. */
  policyCodes: string[];
  /** False when the app's deployed auth sidecar is too old to enforce per-app access. */
  directLinkGateReady: boolean;
}
