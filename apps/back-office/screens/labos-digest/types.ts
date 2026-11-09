export type LabosDigestSource = 'admin' | 'ai';

export type LabosDigestStory = {
  position: number;
  source: LabosDigestSource;
  uid: string;
  title: string;
  summary: string | null;
  sourceDomain: string | null;
  sourceUrl: string;
  eventDate: string;
  tags: string[];
  teamUid: string;
  teamName: string;
};

export type LabosDigestFrequencyPreview = {
  frequency: 'daily' | 'weekly';
  leadIncluded: boolean;
  leadUid: string | null;
  lastLeadNewsItemUid: string | null;
};

export type LabosDigestView = {
  source: LabosDigestSource;
  stories: LabosDigestStory[];
  daily: LabosDigestFrequencyPreview;
  weekly: LabosDigestFrequencyPreview;
  overrideUpdatedAt: string | null;
};

export type LabosDigestTopStoryHistory = {
  frequency: 'daily' | 'weekly';
  sentAt: string;
  position: number;
  isLead: boolean;
};

export type LabosDigestFoundNews = {
  uid: string;
  title: string;
  source: string | null;
  date: string;
  tags: string[];
  wasTopStory: boolean;
  topStoryHistory: LabosDigestTopStoryHistory[];
};

export type LabosDigestFoundNewsPage = {
  page: number;
  limit: number;
  total: number;
  items: LabosDigestFoundNews[];
};

export type LabosDigestNewsFilters = {
  page: number;
  from?: string;
  to?: string;
  tags?: string;
  q?: string;
};
