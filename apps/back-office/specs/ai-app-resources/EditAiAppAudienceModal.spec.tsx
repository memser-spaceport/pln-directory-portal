import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EditAiAppAudienceModal } from '../../components/ai-app-resources/EditAiAppAudienceModal';
import api from '../../utils/api';
import { fetchAiAppAudience, updateAiAppAudience } from '../../utils/services/ai-app-resources';

jest.mock('../../utils/services/ai-app-resources', () => ({
  fetchAiAppAudience: jest.fn(),
  updateAiAppAudience: jest.fn(),
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
const mockApiGet = api.get as jest.Mock;

const policies = [
  { code: 'founder_plc_crypto', name: 'Founder / PLC Crypto', role: 'Founder', group: 'PLC Crypto' },
  { code: 'investor_pl', name: 'Investor / PL', role: 'Investor', group: 'PL' },
  { code: 'unassigned_plc_other', name: 'Unassigned / PLC Other', role: 'Unassigned', group: 'PLC Other' },
  { code: 'advisor_pl', name: 'Advisor / PL', role: 'Advisor', group: 'PL' },
  { code: 'directory_admin_pl', name: 'Directory Admin / PL', role: 'Directory Admin', group: 'PL' },
];
const MEMBER_POLICY_NAMES = ['Founder / PLC Crypto', 'Investor / PL', 'Unassigned / PLC Other'];

const audience = (overrides: Partial<{ policyCodes: string[]; directLinkGateReady: boolean }> = {}) => ({
  appUid: 'cm1',
  appId: 'playbook',
  name: 'PLaybook',
  policyCodes: [],
  directLinkGateReady: true,
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
    mockApiGet.mockResolvedValue({ data: policies });
  });

  it('shows the current audience of the app', async () => {
    mockFetch.mockResolvedValue(audience({ policyCodes: ['investor_pl'] }));
    renderModal();

    expect(await screen.findByText('Published to 1 policy')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith({ authToken: 'token-1', appId: 'playbook' });
    expect(mockApiGet).toHaveBeenCalledWith('/v2/admin/access-control-v2/policies', {
      headers: { authorization: 'Bearer token-1' },
    });
    expect(screen.getByText('PLaybook · playbook')).toBeTruthy();
    expect(selectedPolicies()).toEqual(['Investor / PL']);
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an app without an audience as not published', async () => {
    mockFetch.mockResolvedValue(audience());
    renderModal();

    expect(await screen.findByText('Not published')).toBeTruthy();
    expect(screen.getByText('No policies selected')).toBeTruthy();
    expect(selectedPolicies()).toEqual([]);
  });

  it('lists the policies grouped by role in the picker', async () => {
    mockFetch.mockResolvedValue(audience());
    renderModal();
    await screen.findByText('Not published');

    fireEvent.click(screen.getByText('No policies selected'));
    const options = await screen.findAllByRole('checkbox');
    expect(options).toHaveLength(policies.length);
    ['Advisor', 'Directory Admin', 'Founder', 'Investor', 'Unassigned'].forEach((role) =>
      expect(screen.getByText(role)).toBeTruthy()
    );
  });

  it('selects every Founder, Investor and Unassigned policy with "Select all member policies"', async () => {
    mockFetch.mockResolvedValue(audience({ policyCodes: ['advisor_pl'] }));
    renderModal();
    await screen.findByText('Published to 1 policy');

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
    await screen.findByText('Not published');

    fireEvent.click(screen.getByText('Select all member policies'));
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText(/Members holding any of these 3 policies will be able to open PLaybook\./)).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ authToken: 'token-1', appId: 'playbook', policyCodes: saved })
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Published to 3 policies')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Yes, save')).toBeNull();
  });

  it('unpublishes with an empty list after confirming that nobody outside PL Infra keeps access', async () => {
    mockFetch.mockResolvedValueOnce(audience({ policyCodes: ['investor_pl'] })).mockResolvedValue(audience());
    mockUpdate.mockResolvedValue(audience());
    renderModal();
    await screen.findByText('Published to 1 policy');

    fireEvent.click(screen.getByText('Clear'));
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText(/Nobody outside PL Infra will be able to open PLaybook\./)).toBeTruthy();

    fireEvent.click(screen.getByText('Yes, save'));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ authToken: 'token-1', appId: 'playbook', policyCodes: [] })
    );
    expect(await screen.findByText('Not published')).toBeTruthy();
  });

  it('does not save when the confirmation is cancelled', async () => {
    mockFetch.mockResolvedValue(audience());
    renderModal();
    await screen.findByText('Not published');

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

  it('explains that an app the Directory does not track cannot be published', async () => {
    mockFetch.mockRejectedValue({ response: { status: 404, data: { message: 'AI App not found' } } });
    renderModal();

    expect(
      await screen.findByText('This app is not tracked by the Directory, so it cannot be published.')
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
    await screen.findByText('Not published');

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
    expect(await screen.findByText('Not published')).toBeTruthy();
  });
});
