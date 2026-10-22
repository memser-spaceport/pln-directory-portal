jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false), post: jest.fn(), get: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import { INTEGRATION_SCOPES_KEY } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { IssueMemberProofSchema, RedeemMemberProofSchema } from './dto/member-proof.dto';
import { McpMemberProofsController, McpMemberProofsIntegrationController } from './mcp-member-proofs.controller';

describe('McpMemberProofsController', () => {
  const handler = McpMemberProofsController.prototype.issue;

  it('is POST /v1/mcp/member-proofs with no member-JWT guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, McpMemberProofsController)).toBe('v1/mcp');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('member-proofs');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(GUARDS_METADATA, McpMemberProofsController)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });

  it('passes the bearer token to the service, which accepts only an MCP access token', async () => {
    const proofs = { issue: jest.fn().mockResolvedValue({ proof: 'mcp_mp_x', expiresAt: new Date(0) }) };
    const controller = new McpMemberProofsController(proofs as any);
    const req = { headers: { authorization: 'Bearer mcp_at_live' } } as any;
    await expect(controller.issue({ audience: 'key-1' }, req)).resolves.toEqual({
      proof: 'mcp_mp_x',
      expiresAt: new Date(0),
    });
    expect(proofs.issue).toHaveBeenCalledWith('mcp_at_live', 'key-1');
  });

  it('refuses a request with no bearer token', async () => {
    const proofs = { issue: jest.fn() };
    const controller = new McpMemberProofsController(proofs as any);
    await expect(controller.issue({ audience: 'key-1' }, { headers: {} } as any)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(proofs.issue).not.toHaveBeenCalled();
  });

  it('requires an audience', () => {
    expect(IssueMemberProofSchema.safeParse({ audience: 'key-1' }).success).toBe(true);
    expect(IssueMemberProofSchema.safeParse({ audience: ' ' }).success).toBe(false);
    expect(IssueMemberProofSchema.safeParse({}).success).toBe(false);
  });
});

describe('McpMemberProofsIntegrationController', () => {
  const handler = McpMemberProofsIntegrationController.prototype.redeem;

  it('is POST /v1/integrations/member-proofs/redeem behind an integration key with members:sign-in, answering 200', () => {
    expect(Reflect.getMetadata(PATH_METADATA, McpMemberProofsIntegrationController)).toBe(
      'v1/integrations/member-proofs'
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('redeem');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    expect(Reflect.getMetadata(GUARDS_METADATA, McpMemberProofsIntegrationController)).toEqual([IntegrationKeyGuard]);
    expect(Reflect.getMetadata(INTEGRATION_SCOPES_KEY, McpMemberProofsIntegrationController)).toEqual([
      'members:sign-in',
    ]);
  });

  it('redeems for the calling key', async () => {
    const proofs = { redeem: jest.fn().mockResolvedValue({ memberUid: 'member-1' }) };
    const controller = new McpMemberProofsIntegrationController(proofs as any);
    await expect(
      controller.redeem({ proof: 'mcp_mp_x' }, { integrationKey: { uid: 'key-1' } as any })
    ).resolves.toEqual({ memberUid: 'member-1' });
    expect(proofs.redeem).toHaveBeenCalledWith('mcp_mp_x', 'key-1');
  });

  it('requires a proof', () => {
    expect(RedeemMemberProofSchema.safeParse({ proof: 'mcp_mp_x' }).success).toBe(true);
    expect(RedeemMemberProofSchema.safeParse({ proof: '' }).success).toBe(false);
  });
});
