import {
  canManageAiAppAudience,
  canManageAiAppResources,
  getApiErrorMessage,
  getAppPathError,
  getAudienceConfirmMessage,
  getAudienceStatusLabel,
  getHostUrl,
  hasEmptyResourceValue,
  isNotFoundError,
  isSameAudienceSettings,
  isSamePolicyCodes,
  isSameResourceValues,
  resourcesToForm,
  trimResourceValues,
} from '../../screens/ai-app-resources/utils';
import { DEFAULT_AI_APP_RESOURCES } from '../../screens/ai-app-resources/constants';

describe('ai-app-resources utils', () => {
  describe('canManageAiAppResources', () => {
    it('allows the dedicated permission', () => {
      expect(canManageAiAppResources((p) => p === 'ai_apps.resources.manage')).toBe(true);
    });

    it('allows full Directory admins, as the backend guard does', () => {
      expect(canManageAiAppResources((p) => p === 'directory.admin.full')).toBe(true);
    });

    it('denies admins without either permission', () => {
      expect(canManageAiAppResources((p) => p === 'ai_apps.read' || p === 'admin.tools.access')).toBe(false);
    });
  });

  describe('audience', () => {
    it('lets only full Directory admins manage the audience', () => {
      expect(canManageAiAppAudience((p) => p === 'directory.admin.full')).toBe(true);
      expect(canManageAiAppAudience((p) => p === 'ai_apps.resources.manage' || p === 'ai_apps.read')).toBe(false);
    });

    const lists = (policyCodes: string[], permissionCodes: string[] = [], memberCount = 0) => ({
      policyCodes,
      permissionCodes,
      members: Array.from({ length: memberCount }, (_, i) => ({ uid: `m${i}`, name: `M${i}`, email: null })),
    });

    it('describes the current state', () => {
      expect(getAudienceStatusLabel(lists([]))).toBe('PL Infra only');
      expect(getAudienceStatusLabel(lists(['a']))).toBe('Open to 1 policy');
      expect(getAudienceStatusLabel(lists(['a', 'b', 'c']))).toBe('Open to 3 policies');
      expect(getAudienceStatusLabel(lists([], ['plaa.member']))).toBe('Open to 1 permission');
      expect(getAudienceStatusLabel(lists(['a', 'b'], ['p'], 3))).toBe(
        'Open to 2 policies, 1 permission and 3 members'
      );
      expect(getAudienceStatusLabel({ policyCodes: ['a'] })).toBe('Open to 1 policy');
    });

    it('states plainly what saving does', () => {
      expect(getAudienceConfirmMessage(lists([]), 'PLaybook')).toBe(
        'Nobody outside PL Infra will be able to open PLaybook.'
      );
      expect(getAudienceConfirmMessage(lists(['a']), 'PLaybook')).toBe(
        'Members holding this policy will be able to open PLaybook.'
      );
      expect(getAudienceConfirmMessage(lists(['a', 'b', 'c']), 'PLaybook')).toBe(
        'Members holding any of these 3 policies will be able to open PLaybook.'
      );
      expect(getAudienceConfirmMessage(lists([], ['p'], 5), 'PLaybook')).toBe(
        'Approved members matching any of 1 permission and 5 members will be able to open PLaybook.'
      );
    });

    it('checks the app path the same way the API does', () => {
      expect(getAppPathError('')).toBeNull();
      expect(getAppPathError('pla')).toBeNull();
      expect(getAppPathError('pla-portal-2')).toBeNull();
      ['a', '-pla', 'pla-', 'pl--a', 'PLA', 'pla/x'].forEach((path) => expect(getAppPathError(path)).toBeTruthy());
      expect(getAppPathError('cmu73kls90763n94gzz6s9fmq')).toBe('This looks like an app ID. Pick a readable path.');
    });

    it('compares the edited settings with the saved ones', () => {
      const base = {
        ...lists(['a', 'b'], ['p'], 1),
        showInMore: true,
        path: null,
        iconUrl: null,
        hideTopNav: false,
      };
      expect(isSameAudienceSettings(base, { ...base, policyCodes: ['b', 'a'], path: '' as unknown as null })).toBe(
        true
      );
      expect(isSameAudienceSettings(base, { ...base, showInMore: false })).toBe(false);
      expect(isSameAudienceSettings(base, { ...base, path: 'pla' })).toBe(false);
      expect(isSameAudienceSettings(base, { ...base, members: [] })).toBe(false);
      expect(isSameAudienceSettings(base, { ...base, iconUrl: 'https://x/y.png' })).toBe(false);
      expect(isSameAudienceSettings(base, { ...base, hideTopNav: true })).toBe(false);
    });

    it('compares policy codes regardless of order', () => {
      expect(isSamePolicyCodes(['a', 'b'], ['b', 'a'])).toBe(true);
      expect(isSamePolicyCodes(['a'], ['a', 'b'])).toBe(false);
      expect(isSamePolicyCodes([], [])).toBe(true);
    });

    it('detects a 404 response', () => {
      expect(isNotFoundError({ response: { status: 404 } })).toBe(true);
      expect(isNotFoundError({ response: { status: 403 } })).toBe(false);
      expect(isNotFoundError(new Error('Network Error'))).toBe(false);
    });
  });

  describe('resourcesToForm', () => {
    it('uses the override values when an override exists', () => {
      const override = { cpuRequest: '2', cpuLimit: '4', memoryRequest: '4Gi', memoryLimit: '6Gi' };
      expect(resourcesToForm({ appId: 'a', environment: 'prod', override })).toEqual({
        values: override,
        isOverride: true,
      });
    });

    it('uses the orchestrator defaults when override is null', () => {
      expect(resourcesToForm({ appId: 'a', environment: 'prod', override: null })).toEqual({
        values: { cpuRequest: '30m', cpuLimit: '300m', memoryRequest: '64Mi', memoryLimit: '384Mi' },
        isOverride: false,
      });
    });

    it('returns a copy, not the shared defaults object', () => {
      const { values } = resourcesToForm(undefined);
      values.cpuLimit = '9';
      expect(DEFAULT_AI_APP_RESOURCES.cpuLimit).toBe('300m');
    });
  });

  it('trims values and detects empty fields', () => {
    const values = { cpuRequest: ' 500m ', cpuLimit: '1', memoryRequest: '512Mi', memoryLimit: ' ' };
    expect(hasEmptyResourceValue(values)).toBe(true);
    expect(trimResourceValues(values)).toEqual({
      cpuRequest: '500m',
      cpuLimit: '1',
      memoryRequest: '512Mi',
      memoryLimit: '',
    });
    expect(hasEmptyResourceValue({ ...values, memoryLimit: '1Gi' })).toBe(false);
  });

  it('fills missing override fields with empty strings', () => {
    const partial = { cpuRequest: '1', cpuLimit: '2' } as unknown as {
      cpuRequest: string;
      cpuLimit: string;
      memoryRequest: string;
      memoryLimit: string;
    };
    expect(resourcesToForm({ appId: 'a', environment: 'prod', override: partial }).values).toEqual({
      cpuRequest: '1',
      cpuLimit: '2',
      memoryRequest: '',
      memoryLimit: '',
    });
  });

  it('compares values after trimming', () => {
    const values = { cpuRequest: '30m', cpuLimit: '300m', memoryRequest: '64Mi', memoryLimit: '384Mi' };
    expect(isSameResourceValues({ ...values, cpuRequest: ' 30m ' }, values)).toBe(true);
    expect(isSameResourceValues({ ...values, cpuLimit: '1' }, values)).toBe(false);
  });

  describe('getApiErrorMessage', () => {
    it('returns a string message from the backend', () => {
      expect(getApiErrorMessage({ response: { data: { message: 'cpuRequest must be <= cpuLimit' } } }, 'x')).toBe(
        'cpuRequest must be <= cpuLimit'
      );
    });

    it('joins an array message', () => {
      expect(getApiErrorMessage({ response: { data: { message: ['a', 'b'] } } }, 'x')).toBe('a; b');
    });

    it('joins zod validation errors', () => {
      expect(
        getApiErrorMessage(
          { response: { data: { errors: [{ message: 'memoryRequest must be <= memoryLimit' }] } } },
          'x'
        )
      ).toBe('memoryRequest must be <= memoryLimit');
    });

    it('falls back when there is no usable message', () => {
      expect(getApiErrorMessage(new Error('Network Error'), 'Failed to save')).toBe('Failed to save');
    });
  });

  it('builds an openable host URL', () => {
    expect(getHostUrl('pl-marketing-os.os.pl.xyz')).toBe('https://pl-marketing-os.os.pl.xyz');
    expect(getHostUrl('http://x.test')).toBe('http://x.test');
    expect(getHostUrl(null)).toBeNull();
  });
});
