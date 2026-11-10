import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LabosDigestPage from '../../pages/labos-digest';
import { Menu } from '../../components/menu/menu';
import { useAuth } from '../../context/auth-context';
import {
  fetchLabosDigest,
  fetchLabosDigestNews,
  fetchLabosDigestNewsItem,
  resetLabosDigestPicks,
  saveLabosDigestPicks,
  updateLabosDigestNews,
} from '../../utils/services/labos-digest';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
jest.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, asPath: '/labos-digest', query: {} }),
}));
jest.mock('react-use', () => ({ useCookie: () => ['token-1'] }));
jest.mock('../../utils/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../utils/public-api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../context/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../../layout/approval-layout', () => ({
  ApprovalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../utils/services/labos-digest', () => ({
  fetchLabosDigest: jest.fn(),
  fetchLabosDigestNews: jest.fn(),
  fetchLabosDigestNewsItem: jest.fn(),
  saveLabosDigestPicks: jest.fn(),
  resetLabosDigestPicks: jest.fn(),
  updateLabosDigestNews: jest.fn(),
  postLabosDigestNews: jest.fn(),
}));
jest.mock('../../utils/services/team', () => ({
  fetchTeamsForAutocomplete: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockDigest = fetchLabosDigest as jest.Mock;
const mockNews = fetchLabosDigestNews as jest.Mock;
const mockSave = saveLabosDigestPicks as jest.Mock;
const mockReset = resetLabosDigestPicks as jest.Mock;
const mockItem = fetchLabosDigestNewsItem as jest.Mock;
const mockUpdate = updateLabosDigestNews as jest.Mock;

const view = {
  source: 'ai' as const,
  overrideUpdatedAt: null,
  stories: [
    {
      position: 1,
      source: 'ai' as const,
      uid: 'a',
      title: 'Alpha',
      summary: null,
      sourceDomain: 'a.example',
      sourceUrl: 'https://a.example',
      eventDate: '2026-11-01T00:00:00.000Z',
      tags: ['ai'],
      teamUid: 't1',
      teamName: 'Acme',
    },
    {
      position: 2,
      source: 'ai' as const,
      uid: 'b',
      title: 'Beta',
      summary: null,
      sourceDomain: 'b.example',
      sourceUrl: 'https://b.example',
      eventDate: '2026-10-30T00:00:00.000Z',
      tags: ['funding'],
      teamUid: 't2',
      teamName: 'Beta Labs',
    },
  ],
  daily: { frequency: 'daily' as const, leadIncluded: true, leadUid: 'a', lastLeadNewsItemUid: null },
  weekly: { frequency: 'weekly' as const, leadIncluded: false, leadUid: null, lastLeadNewsItemUid: 'a' },
};

const newsPage = {
  page: 1,
  limit: 20,
  total: 1,
  items: [
    {
      uid: 'c',
      title: 'Gamma',
      summary: 'Gamma shipped a product.',
      source: 'g.example',
      date: '2026-11-04T00:00:00.000Z',
      tags: ['launch'],
      wasTopStory: true,
      topStoryHistory: [{ frequency: 'daily', sentAt: '2026-10-01T00:00:00.000Z', position: 1, isLead: true }],
    },
  ],
};

function asAdmin(isDirectoryAdmin: boolean) {
  mockUseAuth.mockReturnValue({
    user: { uid: 'u1' },
    isLoading: false,
    isDirectoryAdmin,
    canViewDemoDays: false,
    hasPermission: () => isDirectoryAdmin,
  });
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('LabOS Digest page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDigest.mockResolvedValue(view);
    mockNews.mockResolvedValue(newsPage);
    mockSave.mockResolvedValue({ ...view, source: 'admin' });
    mockReset.mockResolvedValue(view);
    mockItem.mockResolvedValue({
      uid: 'a',
      title: 'Alpha',
      summary: 'A summary',
      contentHtml: '<p>Body</p>',
      sourceUrl: 'https://a.example',
      sourceUrls: ['https://a.example'],
      sourceDomain: 'a.example',
      imageUrl: null,
      eventDate: '2026-11-01T00:00:00.000Z',
      tags: ['ai'],
      team: { uid: 't1', name: 'Acme' },
      topStoryHistory: [],
    });
    mockUpdate.mockResolvedValue({});
  });

  it('sends a non-admin to the access denied page', () => {
    asAdmin(false);
    const { container } = renderWithClient(<LabosDigestPage />);
    expect(container.innerHTML).toBe('');
    expect(mockReplace).toHaveBeenCalledWith('/access-denied');
    expect(mockDigest).not.toHaveBeenCalled();
  });

  it('hides the nav item from a non-admin', () => {
    asAdmin(false);
    renderWithClient(<Menu />);
    expect(screen.queryByText('LabOS Digest')).toBeNull();
  });

  it('shows AI picks, the two leads, and saves a new order', async () => {
    asAdmin(true);
    renderWithClient(
      <>
        <Menu />
        <LabosDigestPage />
      </>
    );

    expect(screen.getAllByText('LabOS Digest').length).toBeGreaterThan(0);
    expect(await screen.findByText('AI picks')).toBeTruthy();
    expect(screen.getByText('Next daily email lead: Alpha.')).toBeTruthy();
    expect(screen.getByText(/Next weekly email lead: the email will skip/)).toBeTruthy();
    expect(screen.queryByText('Reset')).toBeNull();

    fireEvent.click(screen.getAllByText('Move down')[0]);
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ authToken: 'token-1', newsItemUids: ['b', 'a'] }));
  });

  it('replaces a story from found news and resets admin picks', async () => {
    asAdmin(true);
    mockDigest.mockResolvedValue({ ...view, source: 'admin' });
    renderWithClient(<LabosDigestPage />);

    expect(await screen.findByText('Admin picks')).toBeTruthy();
    expect(await screen.findByText('Gamma')).toBeTruthy();
    expect(screen.getByText('Gamma shipped a product.')).toBeTruthy();
    expect(screen.getByText(/daily lead 2026-10-01/)).toBeTruthy();

    fireEvent.click(screen.getAllByText('Replace')[0]);
    fireEvent.click(screen.getByText('Use'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ authToken: 'token-1', newsItemUids: ['c', 'b'] }));

    fireEvent.click(screen.getByText('Reset'));
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({ authToken: 'token-1' }));
  });

  it('searches found news by title or content', async () => {
    asAdmin(true);
    renderWithClient(<LabosDigestPage />);

    expect(await screen.findByText('Gamma')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search title or content'), { target: { value: 'Gamma' } });

    await waitFor(() => expect(mockNews).toHaveBeenCalledWith(expect.objectContaining({ q: 'Gamma' })), {
      timeout: 1500,
    });
  });

  it('opens a story and saves a new title', async () => {
    asAdmin(true);
    renderWithClient(<LabosDigestPage />);

    fireEvent.click(await screen.findByRole('button', { name: '1. Alpha' }));
    expect(await screen.findByDisplayValue('Alpha')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'Alpha edited' } });
    fireEvent.click(screen.getAllByText('Save').at(-1) as HTMLElement);

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'a', title: 'Alpha edited', sourceUrls: ['https://a.example'] })
      )
    );
  });
});
