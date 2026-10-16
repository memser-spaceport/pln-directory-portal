import { Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { getFeedbackLinearCredentials } from './feedback-linear.config';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';
const LINEAR_SCOPES = 'read,write';
const REQUEST_TIMEOUT_MS = 15_000;
/** Refresh the cached token this long before Linear says it expires. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * A failed Linear call. Messages come from Linear or from the HTTP layer and
 * never contain the access token or client secret.
 */
export class LinearApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never got a response. */
    readonly status: number,
    /** Linear's `extensions.code` when it sent one. */
    readonly code: string | null,
    /** True for network errors, 5xx, rate limits and auth failures. */
    readonly retryable: boolean,
    /** When Linear asked us to wait (rate limit), in ms from now. */
    readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = 'LinearApiError';
  }

  get isNotFound(): boolean {
    return /not found/i.test(this.message);
  }

  get isAlreadyExists(): boolean {
    return /already exists|duplicate/i.test(this.message);
  }
}

export interface LinearIssueRef {
  id: string;
  identifier: string;
  url: string;
}

export interface LinearIssueCreateInput {
  id: string;
  teamId: string;
  title: string;
  description: string;
  stateId: string;
  projectId?: string;
  labelIds?: string[];
  priority?: number;
  createAsUser?: string;
}

export interface LinearTeamLabel {
  id: string;
  name: string;
  parentName: string | null;
}

export interface LinearProjectRef {
  id: string;
  name: string;
}

export interface LinearWorkflowState {
  id: string;
  /** triage, backlog, unstarted, started, completed or canceled. */
  type: string;
  position: number;
}

export interface LinearTeamDetails {
  id: string;
  key: string;
  name: string;
  private: boolean;
  triageEnabled: boolean;
  states: LinearWorkflowState[];
  /** The team's own labels plus workspace labels. */
  labels: LinearTeamLabel[];
  projects: LinearProjectRef[];
}

export interface LinearUploadTarget {
  uploadUrl: string;
  assetUrl: string;
  headers: { key: string; value: string }[];
}

interface GraphQLErrorBody {
  message?: string;
  extensions?: { code?: string; userPresentableMessage?: string };
}

/**
 * Minimal Linear GraphQL client for feedback pushes. Authenticates as the
 * Linear OAuth app (client credentials); the token lives in memory only.
 */
@Injectable()
export class LinearClient {
  private readonly http: AxiosInstance = axios.create({ timeout: REQUEST_TIMEOUT_MS });
  private token: { value: string; refreshAt: number } | null = null;

  async issueCreate(input: LinearIssueCreateInput): Promise<LinearIssueRef> {
    const data = await this.graphql<{ issueCreate: { success: boolean; issue: LinearIssueRef | null } }>(
      `mutation FeedbackIssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { id identifier url } }
      }`,
      { input }
    );
    if (!data.issueCreate?.success || !data.issueCreate.issue) {
      throw new LinearApiError('Linear did not create the issue', 200, null, true);
    }
    return data.issueCreate.issue;
  }

  /** The issue, or null when Linear has no issue with this id. */
  async issueById(id: string): Promise<LinearIssueRef | null> {
    try {
      const data = await this.graphql<{ issue: LinearIssueRef | null }>(
        `query FeedbackIssueById($id: String!) { issue(id: $id) { id identifier url } }`,
        { id }
      );
      return data.issue ?? null;
    } catch (error) {
      if (error instanceof LinearApiError && error.isNotFound) return null;
      throw error;
    }
  }

  /** The team with its states, labels (team + workspace) and projects, or null when the app can't see it. */
  async team(id: string): Promise<LinearTeamDetails | null> {
    type LabelNode = { id: string; name: string; parent: { name: string } | null };
    let data: {
      team: {
        id: string;
        key: string;
        name: string;
        private: boolean;
        triageEnabled: boolean;
        states: { nodes: LinearWorkflowState[] };
        labels: { nodes: LabelNode[] };
        projects: { nodes: LinearProjectRef[] };
      } | null;
      issueLabels: { nodes: LabelNode[] };
    };
    try {
      data = await this.graphql(
        `query FeedbackTeam($id: String!) {
          team(id: $id) {
            id key name private triageEnabled
            states(first: 100) { nodes { id type position } }
            labels(first: 250) { nodes { id name parent { name } } }
            projects(first: 250) { nodes { id name } }
          }
          issueLabels(first: 250, filter: { team: { null: true } }) { nodes { id name parent { name } } }
        }`,
        { id }
      );
    } catch (error) {
      if (error instanceof LinearApiError && error.isNotFound) return null;
      throw error;
    }
    if (!data.team) return null;
    const toLabel = (label: LabelNode): LinearTeamLabel => ({
      id: label.id,
      name: label.name,
      parentName: label.parent?.name ?? null,
    });
    return {
      id: data.team.id,
      key: data.team.key,
      name: data.team.name,
      private: data.team.private,
      triageEnabled: data.team.triageEnabled,
      states: data.team.states.nodes,
      labels: [...data.team.labels.nodes, ...(data.issueLabels?.nodes ?? [])].map(toLabel),
      projects: data.team.projects.nodes,
    };
  }

  async issueUpdate(id: string, input: { stateId: string }): Promise<void> {
    const data = await this.graphql<{ issueUpdate: { success: boolean } }>(
      `mutation FeedbackIssueUpdate($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }`,
      { id, input }
    );
    if (!data.issueUpdate?.success) {
      throw new LinearApiError('Linear did not update the issue', 200, null, true);
    }
  }

  /** Posts a comment under the given id, so a retry can't post it twice. */
  async commentCreate(input: { id: string; issueId: string; body: string }): Promise<void> {
    const data = await this.graphql<{ commentCreate: { success: boolean } }>(
      `mutation FeedbackCommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) { success }
      }`,
      { input }
    );
    if (!data.commentCreate?.success) {
      throw new LinearApiError('Linear did not create the comment', 200, null, true);
    }
  }

  async fileUpload(contentType: string, filename: string, size: number): Promise<LinearUploadTarget> {
    const data = await this.graphql<{ fileUpload: { success: boolean; uploadFile: LinearUploadTarget | null } }>(
      `mutation FeedbackFileUpload($contentType: String!, $filename: String!, $size: Int!) {
        fileUpload(contentType: $contentType, filename: $filename, size: $size) {
          success uploadFile { uploadUrl assetUrl headers { key value } }
        }
      }`,
      { contentType, filename, size }
    );
    if (!data.fileUpload?.success || !data.fileUpload.uploadFile) {
      throw new LinearApiError('Linear did not return an upload URL', 200, null, true);
    }
    return data.fileUpload.uploadFile;
  }

  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    try {
      return await this.post<T>(query, variables);
    } catch (error) {
      if (error instanceof LinearApiError && this.isAuthFailure(error)) {
        this.token = null;
        return this.post<T>(query, variables);
      }
      throw error;
    }
  }

  private async post<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const token = await this.accessToken();
    let response;
    try {
      response = await this.http.post(
        LINEAR_GRAPHQL_URL,
        { query, variables },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      throw this.fromHttpError(error);
    }
    const errors: GraphQLErrorBody[] | undefined = response.data?.errors;
    if (errors?.length) {
      throw this.fromGraphQLErrors(errors, response.status, response.headers);
    }
    return response.data.data as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.refreshAt) {
      return this.token.value;
    }
    const config = getFeedbackLinearCredentials();
    if (!config) {
      throw new LinearApiError('Linear is not configured', 0, null, false);
    }
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: LINEAR_SCOPES,
    });
    let response;
    try {
      response = await this.http.post(LINEAR_TOKEN_URL, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (error) {
      const mapped = this.fromHttpError(error);
      throw new LinearApiError(
        `Linear token request failed: ${mapped.message}`,
        mapped.status,
        mapped.code,
        true,
        mapped.retryAfterMs
      );
    }
    const value: unknown = response.data?.access_token;
    if (typeof value !== 'string' || !value) {
      throw new LinearApiError('Linear token response had no access token', response.status, null, true);
    }
    const expiresInMs = Number(response.data?.expires_in) * 1000;
    const lifetime = Number.isFinite(expiresInMs) && expiresInMs > 0 ? expiresInMs : 60 * 60_000;
    this.token = { value, refreshAt: Date.now() + Math.max(lifetime - TOKEN_REFRESH_MARGIN_MS, 0) };
    return value;
  }

  private isAuthFailure(error: LinearApiError): boolean {
    return error.status === 401 || error.code === 'AUTHENTICATION_ERROR';
  }

  private fromHttpError(error: unknown): LinearApiError {
    const axiosError = error as AxiosError<{ errors?: GraphQLErrorBody[]; error?: string }>;
    const response = axiosError?.response;
    if (!response) {
      return new LinearApiError(
        `Linear request failed: ${axiosError?.code ?? axiosError?.message ?? 'network error'}`,
        0,
        null,
        true
      );
    }
    if (response.data?.errors?.length) {
      return this.fromGraphQLErrors(response.data.errors, response.status, response.headers);
    }
    const status = response.status;
    const detail = typeof response.data?.error === 'string' ? `: ${response.data.error}` : '';
    return new LinearApiError(
      `Linear responded ${status}${detail}`,
      status,
      null,
      status >= 500 || status === 429 || status === 401,
      status === 429 ? retryAfterMs(response.headers) : null
    );
  }

  private fromGraphQLErrors(
    errors: GraphQLErrorBody[],
    status: number,
    headers: Record<string, unknown> | undefined
  ): LinearApiError {
    const first = errors[0];
    const code = first.extensions?.code ?? null;
    const message = first.extensions?.userPresentableMessage || first.message || 'Linear GraphQL error';
    const rateLimited = code === 'RATELIMITED' || status === 429;
    const retryable = rateLimited || status >= 500 || code === 'AUTHENTICATION_ERROR' || code === 'INTERNAL_ERROR';
    return new LinearApiError(message, status, code, retryable, rateLimited ? retryAfterMs(headers) : null);
  }
}

/** Wait time from `Retry-After` (seconds) or Linear's `X-RateLimit-Requests-Reset` (epoch ms). */
function retryAfterMs(headers: Record<string, unknown> | undefined): number | null {
  if (!headers) return null;
  const retryAfter = Number(headers['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const reset = Number(headers['x-ratelimit-requests-reset']);
  if (Number.isFinite(reset) && reset > Date.now()) return reset - Date.now();
  return null;
}
