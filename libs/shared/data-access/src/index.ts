import { apiNested } from '@protocol-labs-network/contracts';
import { initClient } from '@ts-rest/core';
import { env } from 'process';
export * from './shared.types';

export const client = initClient(apiNested, {
  baseUrl: env['WEB_API_BASE_URL'] as string,
  baseHeaders: {},
});
