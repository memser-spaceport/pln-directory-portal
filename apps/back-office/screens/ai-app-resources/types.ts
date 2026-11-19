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

export interface AiAppAudienceMember {
  uid: string;
  name: string;
  email: string | null;
}

/** The app's LabOS settings and audience as the admin edits and saves them (LAB-3237). */
export interface AiAppAudienceSettings {
  /** RBAC policy codes whose holders can open the app. */
  policyCodes: string[];
  /** Permission codes whose holders can open the app. */
  permissionCodes: string[];
  /** Members who can open the app by name. Policies, permissions and members all empty means PL Infra only. */
  members: AiAppAudienceMember[];
  /** Listed under More in LabOS; when off, the audience still opens the app by its link. */
  showInMore: boolean;
  /** Readable LabOS path segment (`/apps/<path>`); null = the app uid. */
  path: string | null;
  /** Uploaded icon; null = LabOS default icon. */
  iconUrl: string | null;
  /** Open the app full page in LabOS, without the LabOS top navigation. */
  hideTopNav: boolean;
}

export interface AiAppAudienceResponse extends AiAppAudienceSettings {
  appUid: string;
  appId: string;
  name: string;
  /** False when the app's deployed auth sidecar is too old to enforce per-app access. */
  directLinkGateReady: boolean;
}

/** Body of the audience PUT: the settings with members by uid. */
export interface AiAppAudienceUpdate {
  policyCodes: string[];
  permissionCodes: string[];
  memberUids: string[];
  showInMore: boolean;
  path: string | null;
  iconUrl: string | null;
  hideTopNav: boolean;
}

export interface AccessControlPermission {
  uid: string;
  code: string;
  module: string | null;
  description: string | null;
}
