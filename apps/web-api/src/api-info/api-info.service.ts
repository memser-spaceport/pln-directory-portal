import { Injectable } from '@nestjs/common';
import { API_INFO_SERVICE_NAME, DEFAULT_ENVIRONMENT } from './api-info.constants';
import { ApiInfoResponse } from './api-info.schema';
import { resolveServiceVersion } from './api-info.version.util';

@Injectable()
export class ApiInfoService {
  /** Resolved once per process: the version cannot change while the app runs. */
  private version?: string;

  getApiInfo(): ApiInfoResponse {
    return {
      service: API_INFO_SERVICE_NAME,
      environment: process.env.NODE_ENV || DEFAULT_ENVIRONMENT,
      version: this.getVersion(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private getVersion(): string {
    if (this.version === undefined) {
      this.version = resolveServiceVersion();
    }
    return this.version;
  }
}
