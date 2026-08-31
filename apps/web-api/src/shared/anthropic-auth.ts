import { promises as fs } from 'fs';

export type AnthropicAuthMode = 'api_key' | 'wif';

type TokenExchangeResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string | {
    type?: string;
    message?: string;
  };
  error_description?: string;
  message?: string;
};

const WIF_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const DEFAULT_TOKEN_FILE = '/var/run/secrets/anthropic.com/token';
const DEFAULT_TOKEN_ENDPOINT = 'https://api.anthropic.com/v1/oauth/token';
const REFRESH_SKEW_MS = 60_000;

/**
 * Resolves Anthropic authentication for both legacy API-key auth and WIF.
 *
 * WIF mode is intentionally implemented here instead of in callers so every
 * Anthropic integration follows the same token exchange/cache behavior.
 */
export class AnthropicAuth {
  private accessToken?: string;
  private accessTokenExpiresAt = 0;
  private refreshPromise?: Promise<string>;

  get mode(): AnthropicAuthMode {
    const value = (process.env.ANTHROPIC_AUTH_MODE || 'api_key').toLowerCase();
    if (value !== 'api_key' && value !== 'wif') {
      throw new Error(`Unsupported ANTHROPIC_AUTH_MODE: ${value}`);
    }
    return value;
  }

  getApiKey(): string | undefined {
    return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Returns an Authorization bearer token for WIF mode, exchanging the
   * projected Kubernetes identity token only when the cached token is close
   * to expiry.
   */
  async getWifAccessToken(): Promise<string> {
    if (this.mode !== 'wif') {
      throw new Error('Anthropic WIF access token requested while ANTHROPIC_AUTH_MODE is not wif');
    }

    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - REFRESH_SKEW_MS) {
      return this.accessToken;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.exchangeIdentityToken().finally(() => {
        this.refreshPromise = undefined;
      });
    }

    return this.refreshPromise;
  }

  /**
   * Fetch wrapper for @ai-sdk/anthropic. The provider currently expects an API
   * key at construction time, so WIF mode supplies a non-secret placeholder
   * there and this wrapper removes x-api-key before sending the request.
   */
  createWifFetch(): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const token = await this.getWifAccessToken();
      const headers = new Headers(init?.headers);
      headers.delete('x-api-key');
      headers.set('authorization', `Bearer ${token}`);

      return fetch(input, {
        ...init,
        headers,
      });
    };
  }

  private async exchangeIdentityToken(): Promise<string> {
    const federationRuleId = this.requiredEnv('ANTHROPIC_FEDERATION_RULE_ID');
    const organizationId = this.requiredEnv('ANTHROPIC_ORGANIZATION_ID');
    const serviceAccountId = this.requiredEnv('ANTHROPIC_SERVICE_ACCOUNT_ID');
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    const tokenFile = process.env.ANTHROPIC_IDENTITY_TOKEN_FILE || DEFAULT_TOKEN_FILE;

    const assertion = (await fs.readFile(tokenFile, 'utf8')).trim();
    if (!assertion) {
      throw new Error(`Anthropic identity token file is empty: ${tokenFile}`);
    }

    const response = await fetch(process.env.ANTHROPIC_TOKEN_ENDPOINT || DEFAULT_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: WIF_GRANT_TYPE,
        assertion,
        federation_rule_id: federationRuleId,
        organization_id: organizationId,
        service_account_id: serviceAccountId,
        ...(workspaceId && { workspace_id: workspaceId }),
      }),
    });

    const body = (await response.json()) as TokenExchangeResponse;
    if (!response.ok || !body.access_token) {
      const apiError =
        typeof body.error === 'string'
          ? body.error
          : body.error?.message || body.error?.type;

      const reason =
        body.error_description ||
        apiError ||
        body.message ||
        `HTTP ${response.status}`;

      throw new Error(`Anthropic WIF token exchange failed: ${reason}`);
    }

    const expiresInSeconds = Number(body.expires_in || 600);
    this.accessToken = body.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(expiresInSeconds, 1) * 1000;
    return this.accessToken;
  }

  private requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} missing`);
    return value;
  }
}

export const anthropicAuth = new AnthropicAuth();
