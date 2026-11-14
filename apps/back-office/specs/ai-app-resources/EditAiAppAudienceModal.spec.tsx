import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EditAiAppAudienceModal } from '../../components/ai-app-resources/EditAiAppAudienceModal';
import api from '../../utils/api';
import {
  fetchAccessControlPermissions,
  fetchAiAppAudience,
  updateAiAppAudience,
  uploadAiAppIcon,
} from '../../utils/services/ai-app-resources';

jest.mock('../../utils/services/ai-app-resources', () => ({
  fetchAiAppAudience: jest.fn(),
  updateAiAppAudience: jest.fn(),
  fetchAccessControlPermissions: jest.fn(),
  uploadAiAppIcon: jest.fn(),
}));
jest.mock('../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../components/modal/modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockFetch = fetchAiAppAudience as jest.Mock;
const mockUpdate = updateAiAppAudience as jest.Mock;
const mockPermissions = fetchAccessControlPermissions as jest.Mock;
const mockUpload = uploadAiAppIcon as jest.Mock;
const mockApiGet = api.get as jest.Mock;

const policies = [
  { code: 'founder_plc_crypto', name: 'Founder / PLC Crypto', role: 'Founder', group: 'PLC Crypto' },
  { code: 'investor_pl', name: 'Investor / PL', role: 'Investor', group: 'PL' },
  { code: 'unassigned_plc_other', name: 'Unassigned / PLC Other', role: 'Unassigned', group: 'PLC Other' },
  { code: 'advisor_pl', name: 'Advisor / PL', role: 'Advisor', group: 'PL' },
  { code: 'directory_admin_pl', name: 'Directory Admin / PL', role: 'Directory Admin', group: 'PL' },
];
const MEMBER_POLICY_NAMES = ['Founder / PLC Crypto', 'Investor / PL', 'Unassigned / PLC Other'];

const permissions = [
  { uid: 'p1', code: 'plaa.member', module: 'plaa', description: 'PLAA member access' },
  { uid: 'p2', code: 'deals.read', module: 'deals', description: null },
];
const searchRows = [
  { uid: 'm-ada', name: 'Ada Founder', email: 'ada@example.test', teamMemberRoles: [] },
  { uid: 'm-bob', name: 'Bob Builder', email: null, teamMemberRoles: [] },
];

type AudienceOverrides = Partial<{
  policyCodes: string[];
  permissionCodes: string[];
  members: Array<{ uid: string; name: string; email: string | null }>;
  showInMore: boolean;
  path: string | null;
  iconUrl: string | null;
  hideTopNav: boolean;
  directLinkGateReady: boolean;
}>;

const audience = (overrides: AudienceOverrides = {}) => ({
  appUid: 'cm1',
  appId: 'playbook',
  name: 'PLaybook',
  policyCodes: [],
  permissionCodes: [],
  members: [],
  showInMore: true,
  path: null,
  iconUrl: null,
  hideTopNav: false,
  directLinkGateReady: true,
  ...overrides,
});

/** The full PUT body for the given changes on top of the default settings. */
const saveBody = (overrides: Record<string, unknown> = {}) => ({
  authToken: 'token-1',
  appId: 'playbook',
  policyCodes: [],
  permissionCodes: [],
  memberUids: [],
  showInMore: true,
  path: null,
  iconUrl: null,
  hideTopNav: false,
  ...overrides,
});

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditAiAppAudienceModal appId="playbook" authToken="token-1" onClose={jest.fn()} />
    </QueryClientProvider>
  );
}

/** Policies shown as selected in the picker. */
const selectedPolicies = () =>
  Array.from(document.querySelectorAll('span[title]')).map((el) => el.getAttribute('title'));

describe('EditAiAppAudienceModal', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockApiGet.mockImplementation(async (url: string) =>
      url.includes('/rbac/members/search') ? { data: searchRows } : { data: policies }
    );
    mockPermissions.mockResolvedValue(permissions);
  });

  it('shows the current audience of the app', async () => {
    mockFetch.mockResolvedValue(audience({ policyCodes: ['investor_pl'] }));
    renderModal();

    expect(await screen.findByText('Open to 1 policy')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith({ authToken: 'token-1', appId: 'playbook' });
    expect(mockApiGet).toHaveBeenCalledWith('/v2/admin/access-control-v2/policies', {
      headers: { authorization: 'Bearer token-1' },
    });
    expect(screen.getByText('PLaybook · playbook')).toBeTruthy();
    expect(selectedPolicies()).toEqual(['Investor / PL']);
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an app without an audience as PL Infra only', async () => {
    mockFetch.mockResolvedValue(audience());
    renderModal();

    expect(await screen.findByText('PL Infra only')).toBeTruthy();
    expect(screen.getByText('No policies selected')).toBeTruthy();
    expect(selectedPolicies()).toEqual([]);
  });

  it('lists the policies grouped by role in the picker', async () => {
    mockFetch.mockResolvedValue(audience());
    renderModal();
    await screen.findByText('PL Infra only');

    fireEvent.click(screen.getByText('No policies selected'));
    await screen.findByText('Advisor');
    const settingsCheckboxes = [screen.getByLabelText(/Show under More/), screen.getByLabelText(/Hide top navigation/)];
    const options = screen.getAllByRole('checkbox').filter((box) => !settingsCheckboxes.includes(box));
    expect(options).toHaveLength(policies.length);
    ['Advisor', 'Directory Admin', 'Founder', 'Investor', 'Unassigned'].forEach((role) =>
      expect(screen.getByText(role)).toBeTruthy()
    );
  });

  it('selects every Founder, Investor and Unassigned policy with "Select all member policies"', async () => {
    mockFetch.mockResolvedValue(audience({ policyCodes: ['advisor_pl'] }));
    renderModal();
    await screen.findByText('Open to 1 policy');

    fireEvent.click(screen.getByText('Select all member policies'));
    expect(selectedPolicies()).toEqual(['Advisor / PL', ...MEMBER_POLICY_NAMES]);
    expect(screen.queryByTitle('Directory Admin / PL')).toBeNull();

    fireEvent.click(screen.getByText('Clear'));
    expect(selectedPolicies()).toEqual([]);
  });

  it('saves the selected policy codes after one confirmation that states who gets access', async () => {
    const saved = ['founder_plc_crypto', 'investor_pl', 'unassigned_plc_other'];
    mockFetch.mockResolvedValueOnce(audience()).mockResolvedValue(audience({ policyCodes: saved }));
    mockUpdate.mockResolvedValue(audience({ policyCodes: saved }));
    renderModal();
    await screen.findByText('PL Infra only');

    fireEvent.click(screen.getByText('Select all member policies'));
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText(/Members holding any of these 3 policies will be able to open PLaybook\./)).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(saveBody({ policyCodes: saved })));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Open to 3 policies')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Yes, save')).toBeNull();
  });

  it('limits the app to PL Infra with an empty list after confirming that nobody outside PL Infra keeps access', async () => {
    mockFetch.mockResolvedValueOnce(audience({ policyCodes: ['investor_pl'] })).mockResolvedValue(audience());
    mockUpdate.mockResolvedValue(audience());
    renderModal();
    await screen.findByText('Open to 1 policy');

    fireEvent.click(screen.getByText('Clear'));
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText(/Nobody outside PL Infra will be able to open PLaybook\./)).toBeTruthy();

    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(saveBody()));
    expect(await screen.findByText('PL Infra only')).toBeTruthy();
  });

  it('does not save when the confirmation is cancelled', async () => {
    mockFetch.mockResolvedValue(audience());
    renderModal();
    await screen.findByText('PL Infra only');

    fireEvent.click(screen.getByText('Select all member policies'));
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Yes, save')).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(selectedPolicies()).toEqual(MEMBER_POLICY_NAMES);
  });

  it('warns when the deployed app cannot enforce per-app access yet', async () => {
    mockFetch.mockResolvedValue(audience({ policyCodes: ['investor_pl'], directLinkGateReady: false }));
    renderModal();

    expect((await screen.findByRole('status')).textContent).toContain(
      'will be refused on the app until it is redeployed'
    );
  });

  it('explains that an app the Directory does not track cannot be opened to members', async () => {
    mockFetch.mockRejectedValue({ response: { status: 404, data: { message: 'AI App not found' } } });
    renderModal();

    expect(
      await screen.findByText('This app is not tracked by the Directory, so it cannot be opened to members.')
    ).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText('Select all member policies')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shows the backend error and keeps the selection when a save is rejected', async () => {
    mockFetch.mockResolvedValue(audience());
    mockUpdate.mockRejectedValue({ response: { status: 400, data: { message: 'Unknown policy code: investor_pl' } } });
    renderModal();
    await screen.findByText('PL Infra only');

    fireEvent.click(screen.getByText('Select all member policies'));
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Yes, save'));

    expect((await screen.findByRole('alert')).textContent).toBe('Unknown policy code: investor_pl');
    expect(selectedPolicies()).toEqual(MEMBER_POLICY_NAMES);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shows a retry action when the audience cannot be loaded', async () => {
    mockFetch.mockRejectedValueOnce({ response: { status: 403, data: { message: 'Forbidden' } } });
    mockFetch.mockResolvedValue(audience());
    renderModal();

    expect(await screen.findByText('Forbidden')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('PL Infra only')).toBeTruthy();
  });
  it('adds a permission to the audience and saves it', async () => {
    mockFetch.mockResolvedValue(audience());
    mockUpdate.mockResolvedValue(audience({ permissionCodes: ['plaa.member'] }));
    renderModal();
    await screen.findByText('PL Infra only');

    const input = screen.getByLabelText('Permissions that can open this app');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByText('plaa.member — PLAA member access'));
    fireEvent.click(screen.getByText('Save'));
    expect(
      screen.getByText(/Approved members matching any of 1 permission will be able to open PLaybook\./)
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(saveBody({ permissionCodes: ['plaa.member'] })));
  });

  it('adds members found by search, removes them, and saves their uids', async () => {
    mockFetch.mockResolvedValue(audience({ members: [{ uid: 'm-old', name: 'Old Friend', email: null }] }));
    mockUpdate.mockResolvedValue(audience());
    renderModal();
    expect(await screen.findByText('Open to 1 member')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Members who can open this app'), { target: { value: 'ad' } });
    fireEvent.click(await screen.findByText('Ada Founder'));
    expect(screen.getByLabelText('Selected members').textContent).toContain('Ada Founder');
    fireEvent.click(screen.getByLabelText('Remove Old Friend'));

    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(saveBody({ memberUids: ['m-ada'] })));
    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/rbac/members/search?q=ad'), expect.anything());
  });

  it('saves the LabOS settings: More, path, icon and top navigation', async () => {
    mockFetch.mockResolvedValue(audience({ policyCodes: ['investor_pl'] }));
    mockUpdate.mockResolvedValue(audience());
    mockUpload.mockResolvedValue('https://cdn.example.test/pla.png');
    renderModal();
    await screen.findByText('Open to 1 policy');

    fireEvent.click(screen.getByLabelText(/Show under More/));
    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'PLA' } });
    fireEvent.change(screen.getByTestId('ai-app-icon-input'), {
      target: { files: [new File(['x'], 'pla.png', { type: 'image/png' })] },
    });
    expect(await screen.findByAltText('App icon')).toBeTruthy();
    expect(mockUpload).toHaveBeenCalledWith({ authToken: 'token-1', file: expect.any(File) });
    fireEvent.click(screen.getByLabelText(/Hide top navigation/));

    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        saveBody({
          policyCodes: ['investor_pl'],
          showInMore: false,
          path: 'pla',
          iconUrl: 'https://cdn.example.test/pla.png',
          hideTopNav: true,
        })
      )
    );
  });

  it('blocks an invalid path before saving', async () => {
    mockFetch.mockResolvedValue(audience());
    renderModal();
    await screen.findByText('PL Infra only');

    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'pla-' } });
    expect((await screen.findByRole('alert')).textContent).toContain('lowercase letters');
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a taken path next to the field and does not close the form', async () => {
    mockFetch.mockResolvedValue(audience());
    mockUpdate.mockRejectedValue({
      response: { status: 409, data: { message: 'Path "pla" is already used by another app', code: 'path_taken' } },
    });
    renderModal();
    await screen.findByText('PL Infra only');

    fireEvent.change(screen.getByLabelText('Path'), { target: { value: 'pla' } });
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Yes, save'));

    expect((await screen.findByRole('alert')).textContent).toBe('Path "pla" is already used by another app');
    expect((screen.getByLabelText('Path') as HTMLInputElement).value).toBe('pla');
  });

  it('removes the icon', async () => {
    mockFetch.mockResolvedValue(audience({ iconUrl: 'https://cdn.example.test/old.png' }));
    mockUpdate.mockResolvedValue(audience());
    renderModal();
    await screen.findByAltText('App icon');

    fireEvent.click(screen.getByText('Remove icon'));
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(saveBody({ iconUrl: null })));
  });
});
