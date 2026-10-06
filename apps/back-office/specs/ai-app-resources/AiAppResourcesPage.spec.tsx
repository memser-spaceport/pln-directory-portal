import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AiAppResourcesPage from '../../pages/ai-app-resources';
import { Menu } from '../../components/menu/menu';
import { useAuth } from '../../context/auth-context';
import { fetchAiAppResources, fetchAiAppsList } from '../../utils/services/ai-app-resources';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, asPath: '/ai-app-resources', query: {} }),
}));
jest.mock('../../components/modal/modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
jest.mock('react-use', () => ({ useCookie: () => ['token-1'] }));
jest.mock('../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../utils/public-api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../context/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../layout/approval-layout', () => ({
  ApprovalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../utils/services/ai-app-resources', () => ({
  fetchAiAppsList: jest.fn(),
  fetchAiAppResources: jest.fn(),
  updateAiAppResources: jest.fn(),
  resetAiAppResources: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockList = fetchAiAppsList as jest.Mock;
const mockGet = fetchAiAppResources as jest.Mock;

function asUser(permissions: string[]) {
  mockUseAuth.mockReturnValue({
    user: { uid: 'u1' },
    isLoading: false,
    isDirectoryAdmin: permissions.includes('directory.admin.full'),
    canViewDemoDays: false,
    hasPermission: (p: string) => permissions.includes(p),
  });
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const apps = [
  {
    app_id: 'pl-marketing-os',
    environment: 'prod',
    release_name: 'pl-marketing-os',
    deployment_id: '1791267799',
    s3_key: null,
    status: 'success',
    host: 'pl-marketing-os.os.pl.xyz',
    image: null,
    error: null,
    started_at: null,
    finished_at: null,
    created_at: null,
    updated_at: '2026-10-06T08:31:52.271Z',
  },
  {
    app_id: 'pl-marketing-os',
    environment: 'preview',
    release_name: 'pl-marketing-os-preview',
    deployment_id: null,
    s3_key: null,
    status: 'failed',
    host: null,
    image: null,
    error: 'Build failed',
    started_at: null,
    finished_at: null,
    created_at: null,
    updated_at: null,
  },
];

describe('AI Apps Resources page', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows nothing, loads no data and redirects an admin without the permission', () => {
    asUser(['admin.tools.access', 'ai_apps.read']);
    const { container } = renderWithClient(<AiAppResourcesPage />);

    expect(container.innerHTML).toBe('');
    expect(mockList).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/access-denied');
  });

  it('lists every app per environment and opens the editor for the exact app and environment', async () => {
    asUser(['ai_apps.resources.manage']);
    mockList.mockResolvedValue(apps);
    mockGet.mockResolvedValue({ appId: 'pl-marketing-os', environment: 'preview', override: null });
    renderWithClient(<AiAppResourcesPage />);

    expect(await screen.findByText('pl-marketing-os.os.pl.xyz')).toBeTruthy();
    expect(screen.getByText('pl-marketing-os.os.pl.xyz').getAttribute('href')).toBe(
      'https://pl-marketing-os.os.pl.xyz'
    );
    expect(screen.getByText('prod')).toBeTruthy();
    expect(screen.getByText('preview')).toBeTruthy();
    expect(screen.getByText('Build failed')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByText('Edit resources')[1]);
    expect(await screen.findByText('Using default resources')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith({ authToken: 'token-1', appId: 'pl-marketing-os', environment: 'preview' });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no apps', async () => {
    asUser(['directory.admin.full']);
    mockList.mockResolvedValue([]);
    renderWithClient(<AiAppResourcesPage />);

    expect(await screen.findByText('No AI Apps yet')).toBeTruthy();
  });

  it('shows an error with a retry action when the list cannot be loaded', async () => {
    asUser(['ai_apps.resources.manage']);
    mockList.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue([]);
    renderWithClient(<AiAppResourcesPage />);

    expect(await screen.findByText('Failed to load AI Apps.')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('No AI Apps yet')).toBeTruthy();
  });
});

describe('Menu', () => {
  beforeEach(() => jest.resetAllMocks());

  it('shows the AI Apps Resources entry only to admins who can manage resources', () => {
    asUser(['ai_apps.resources.manage']);
    const { unmount } = render(<Menu />);
    expect(screen.getByText('AI Apps Resources')).toBeTruthy();
    unmount();

    asUser(['admin.tools.access']);
    render(<Menu />);
    expect(screen.queryByText('AI Apps Resources')).toBeNull();
  });
});
