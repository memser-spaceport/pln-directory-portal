import {
  BadGatewayException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { UpdateAiAppResourcesDto } from './dto/ai-app-resources.dto';

@Injectable()
export class AiAppResourcesService {
  private readonly baseUrl = (
    process.env.AI_APPS_RUNNER_URL || ''
  ).replace(/\/$/, '');

  private readonly runnerToken = process.env.AI_APPS_RUNNER_TOKEN || '';
  private readonly resourceAdminToken =
    process.env.AI_APPS_RESOURCE_ADMIN_TOKEN || '';

  private ensureRunnerConfig() {
    if (!this.baseUrl || !this.runnerToken) {
      throw new ServiceUnavailableException(
        'AI Apps runner is not configured',
      );
    }
  }

  private ensureResourceAdminConfig() {
    this.ensureRunnerConfig();

    if (!this.resourceAdminToken) {
      throw new ServiceUnavailableException(
        'AI App resource management is not configured',
      );
    }
  }

  private runnerHeaders() {
    this.ensureRunnerConfig();

    return {
      headers: {
        'x-runner-token': this.runnerToken,
      },
    };
  }

  private resourceAdminHeaders() {
    this.ensureResourceAdminConfig();

    return {
      headers: {
        'x-runner-token': this.runnerToken,
        'x-resource-admin-token': this.resourceAdminToken,
      },
    };
  }

  private url(path: string) {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private resourcesUrl(appId: string) {
    return this.url(
      `/v1/admin/apps/${encodeURIComponent(appId)}/resources`,
    );
  }

  private rethrow(error: unknown, operation: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    const e = error as AxiosError<{
      message?: string;
      error?: string;
    }>;

    const upstream =
      e.response?.data?.message ||
      e.response?.data?.error;

    throw new BadGatewayException(
      upstream || `Orchestrator ${operation} failed`,
    );
  }

  async list() {
    try {
      const response = await axios.get(
        this.url('/apps'),
        this.runnerHeaders(),
      );

      return response.data;
    } catch (error) {
      this.rethrow(error, 'app list');
    }
  }

  async get(appId: string, environment: string) {
    try {
      const response = await axios.get(
        this.resourcesUrl(appId),
        {
          ...this.resourceAdminHeaders(),
          params: { environment },
        },
      );

      return response.data;
    } catch (error) {
      this.rethrow(error, 'resource lookup');
    }
  }

  async update(
    appId: string,
    environment: string,
    resources: UpdateAiAppResourcesDto,
  ) {
    try {
      const response = await axios.put(
        this.resourcesUrl(appId),
        resources,
        {
          ...this.resourceAdminHeaders(),
          params: { environment },
        },
      );

      return response.data;
    } catch (error) {
      this.rethrow(error, 'resource override');
    }
  }

  async remove(appId: string, environment: string) {
    try {
      const response = await axios.delete(
        this.resourcesUrl(appId),
        {
          ...this.resourceAdminHeaders(),
          params: { environment },
        },
      );

      return response.data;
    } catch (error) {
      this.rethrow(error, 'resource override deletion');
    }
  }
}
