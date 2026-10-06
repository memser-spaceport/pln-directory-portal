import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EditAiAppResourcesModal } from '../../components/ai-app-resources/EditAiAppResourcesModal';
import { fetchAiAppResources, resetAiAppResources, updateAiAppResources } from '../../utils/services/ai-app-resources';

jest.mock('../../utils/services/ai-app-resources', () => ({
  fetchAiAppResources: jest.fn(),
  updateAiAppResources: jest.fn(),
  resetAiAppResources: jest.fn(),
}));

jest.mock('../../components/modal/modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockFetch = fetchAiAppResources as jest.Mock;
const mockUpdate = updateAiAppResources as jest.Mock;
const mockReset = resetAiAppResources as jest.Mock;

const override = { cpuRequest: '2', cpuLimit: '4', memoryRequest: '4Gi', memoryLimit: '6Gi' };

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditAiAppResourcesModal
        target={{ appId: 'pl-marketing-os', environment: 'preview' }}
        authToken="token-1"
        onClose={jest.fn()}
      />
    </QueryClientProvider>
  );
}

const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;

describe('EditAiAppResourcesModal', () => {
  beforeEach(() => jest.resetAllMocks());

  it('loads resources for the exact app and environment and shows the defaults when there is no override', async () => {
    mockFetch.mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override: null });
    renderModal();

    expect(await screen.findByText('Using default resources')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith({ authToken: 'token-1', appId: 'pl-marketing-os', environment: 'preview' });
    expect(input('cpuRequest').value).toBe('30m');
    expect(input('cpuLimit').value).toBe('300m');
    expect(input('memoryRequest').value).toBe('64Mi');
    expect(input('memoryLimit').value).toBe('384Mi');
    expect(screen.queryByText('Reset to defaults')).toBeNull();
  });

  it('keeps save disabled until a value changes, so the defaults are not saved as an override by accident', async () => {
    mockFetch.mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override: null });
    renderModal();
    await screen.findByText('Using default resources');

    const save = screen.getByText('Save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(mockUpdate).not.toHaveBeenCalled();

    fireEvent.change(input('cpuLimit'), { target: { value: '500m' } });
    expect(save.disabled).toBe(false);
  });

  it('shows the override values and marks them as a custom override', async () => {
    mockFetch.mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override });
    renderModal();

    expect(await screen.findByText('Custom resource override')).toBeTruthy();
    expect(input('cpuRequest').value).toBe('2');
    expect(input('memoryLimit').value).toBe('6Gi');
    expect(screen.getByText('Reset to defaults')).toBeTruthy();
  });

  it('saves the four values, disables save while saving, and reloads the values from the API', async () => {
    const saved = { cpuRequest: '500m', cpuLimit: '1', memoryRequest: '512Mi', memoryLimit: '1Gi' };
    mockFetch
      .mockResolvedValueOnce({ appId: 'pl-marketing-os', environment: 'preview', override: null })
      .mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override: saved });
    let resolveSave: (v: unknown) => void = () => undefined;
    mockUpdate.mockImplementation(() => new Promise((resolve) => (resolveSave = resolve)));
    renderModal();
    await screen.findByText('Using default resources');

    fireEvent.change(input('cpuRequest'), { target: { value: ' 500m ' } });
    fireEvent.change(input('cpuLimit'), { target: { value: '1' } });
    fireEvent.change(input('memoryRequest'), { target: { value: '512Mi' } });
    fireEvent.change(input('memoryLimit'), { target: { value: '1Gi' } });
    fireEvent.click(screen.getByText('Save'));

    const savingButton = (await screen.findByText('Saving...')) as HTMLButtonElement;
    expect(savingButton.disabled).toBe(true);
    fireEvent.click(savingButton);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      authToken: 'token-1',
      appId: 'pl-marketing-os',
      environment: 'preview',
      resources: saved,
    });

    resolveSave({});
    expect(await screen.findByText('Custom resource override')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(input('cpuRequest').value).toBe('500m');
  });

  it('shows the backend validation error and keeps the entered values', async () => {
    mockFetch.mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override });
    mockUpdate.mockRejectedValue({ response: { status: 422, data: { message: 'cpuRequest must be <= cpuLimit' } } });
    renderModal();
    await screen.findByText('Custom resource override');

    fireEvent.change(input('cpuRequest'), { target: { value: '8' } });
    fireEvent.click(screen.getByText('Save'));

    expect((await screen.findByRole('alert')).textContent).toBe('cpuRequest must be <= cpuLimit');
    expect(input('cpuRequest').value).toBe('8');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('requires all four fields before it calls the API', async () => {
    mockFetch.mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override: null });
    renderModal();
    await screen.findByText('Using default resources');

    fireEvent.change(input('memoryLimit'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save'));

    expect((await screen.findByRole('alert')).textContent).toBe('All four fields are required.');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('resets to defaults after confirmation and shows the defaults from the reloaded API response', async () => {
    mockFetch
      .mockResolvedValueOnce({ appId: 'pl-marketing-os', environment: 'preview', override })
      .mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override: null });
    mockReset.mockResolvedValue({ deleted: true });
    renderModal();
    await screen.findByText('Custom resource override');

    fireEvent.click(screen.getByText('Reset to defaults'));
    expect(mockReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Yes, reset'));

    await waitFor(() =>
      expect(mockReset).toHaveBeenCalledWith({ authToken: 'token-1', appId: 'pl-marketing-os', environment: 'preview' })
    );
    expect(await screen.findByText('Using default resources')).toBeTruthy();
    expect(input('cpuLimit').value).toBe('300m');
  });

  it('shows a retry action when the resources cannot be loaded', async () => {
    mockFetch
      .mockRejectedValueOnce({ response: { data: { message: 'Orchestrator resource lookup failed' } } })
      .mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override: null });
    renderModal();

    expect(await screen.findByText('Orchestrator resource lookup failed')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Using default resources')).toBeTruthy();
  });
});
