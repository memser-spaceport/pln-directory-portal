import { Injectable } from '@nestjs/common';
import { APP_ENV } from '../utils/constants';

/** The pilot gate for the LabOS agent (LAB-3272 contract C1). */
@Injectable()
export class LabosAgentAccessService {
  /**
   * Temporary rule until D1 (who sees the agent). Only this function changes for D1.
   * Today: on for every live member outside production, off on production.
   * A caller with no live member (unknown or deleted) is never enabled.
   */
  isEnabled(memberUid: string | undefined): boolean {
    if (!memberUid) return false;
    return process.env.ENVIRONMENT !== APP_ENV.PRODUCTION;
  }
}
