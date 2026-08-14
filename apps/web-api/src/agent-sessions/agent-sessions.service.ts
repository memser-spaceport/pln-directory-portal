import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { CODE_FIX_ORCHESTRATOR_TIMEOUT_MS, CODE_FIX_ORCHESTRATOR_URL } from './agent-sessions.constants';
import { CreateAgentSessionDto } from './dto/create-agent-session.dto';

@Injectable()
export class AgentSessionsService {
  private readonly logger = new Logger(AgentSessionsService.name);
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: CODE_FIX_ORCHESTRATOR_URL,
      timeout: CODE_FIX_ORCHESTRATOR_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
  }

  async listRepositories() {
    return this.proxyGet('/v1/repositories');
  }

  async listSessions(query: { limit?: number; status?: string }) {
    return this.proxyGet('/v1/tasks', {
      limit: query.limit,
      status: query.status,
    });
  }

  async getSession(id: string) {
    return this.proxyGet(`/v1/tasks/${encodeURIComponent(id)}`);
  }

  async getProgress(id: string) {
    return this.proxyGet(`/v1/tasks/${encodeURIComponent(id)}/progress`);
  }

  async createSession(dto: CreateAgentSessionDto, requestedBy: string) {
    return this.proxyPost('/v1/tasks', {
      repository: dto.repository,
      baseBranch: dto.baseBranch,
      prompt: dto.prompt,
      createFeatureEnvironment: dto.createFeatureEnvironment ?? false,
      requestedBy,
    });
  }

  async listMessages(id: string, query: { afterId?: string; limit?: number }) {
    return this.proxyGet(`/v1/tasks/${encodeURIComponent(id)}/messages`, {
      afterId: query.afterId,
      limit: query.limit,
    });
  }

  // Returns 202 with { message, executionId, executionNumber, executionStatus,
  // kubernetesJobName } — posting a message resumes the agent from the session's
  // existing branch, so this starts a real run rather than just recording text.
  async createMessage(id: string, message: string) {
    return this.proxyPost(`/v1/tasks/${encodeURIComponent(id)}/messages`, { message });
  }

  async deployFeatureEnv(id: string, force = false) {
    return this.proxyPost(
      `/v1/tasks/${encodeURIComponent(id)}/deploy-feature-env`,
      {},
      { force: force ? 'true' : 'false' },
    );
  }

  async deleteFeatureEnv(id: string, force = false) {
    return this.proxyDelete(`/v1/tasks/${encodeURIComponent(id)}/feature-env`, {
      force: force ? 'true' : 'false',
    });
  }

  private async proxyGet(path: string, params?: Record<string, unknown>) {
    try {
      const response = await this.client.get(path, { params });
      return response.data;
    } catch (error) {
      this.rethrowUpstream(error, 'GET', path);
    }
  }

  private async proxyPost(
    path: string,
    body: Record<string, unknown>,
    params?: Record<string, unknown>,
  ) {
    try {
      const response = await this.client.post(path, body, { params });
      return response.data;
    } catch (error) {
      this.rethrowUpstream(error, 'POST', path);
    }
  }

  private async proxyDelete(path: string, params?: Record<string, unknown>) {
    try {
      const response = await this.client.delete(path, { params });
      return response.data;
    } catch (error) {
      this.rethrowUpstream(error, 'DELETE', path);
    }
  }

  private rethrowUpstream(error: unknown, method: string, path: string): never {
    if (!axios.isAxiosError(error)) {
      this.logger.error(`Unexpected error proxying ${method} ${path}`, error);
      throw new BadGatewayException('Failed to reach code-fix orchestrator');
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data;
    this.logger.warn(`Orchestrator ${method} ${path} failed: status=${status ?? 'none'} message=${axiosError.message}`);

    if (!status) {
      throw new ServiceUnavailableException('Code-fix orchestrator is unavailable');
    }

    const payload =
      typeof data === 'object' && data !== null ? data : { error: 'orchestrator_error', message: axiosError.message };

    switch (status) {
      case 400:
        throw new BadRequestException(payload);
      case 404:
        throw new NotFoundException(payload);
      case 409:
        throw new ConflictException(payload);
      case 503:
        throw new ServiceUnavailableException(payload);
      default:
        throw new BadGatewayException(payload);
    }
  }
}
