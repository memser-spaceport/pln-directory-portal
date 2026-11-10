import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import {
  useLabosDigest,
  useLabosDigestNews,
  useLabosDigestNewsItem,
  useResetLabosDigestPicks,
  useSaveLabosDigestPicks,
} from '../../hooks/labos-digest/useLabosDigest';
import { NewsDetailModal, PostNewsModal } from './DigestModals';
import type { LabosDigestFoundNews, LabosDigestStory, LabosDigestView } from './types';
import s from './LabosDigestPage.module.scss';

const DEBOUNCE_MS = 300;

const sameOrder = (left: string[], right: string[]) => left.join() === right.join();

const day = (value: string) => value.slice(0, 10);

function leadLine(label: string, view: LabosDigestView, frequency: 'daily' | 'weekly') {
  const preview = frequency === 'daily' ? view.daily : view.weekly;
  const first = view.stories[0];
  if (!first) return `${label}: no top story.`;
  if (!preview.leadIncluded) {
    return `${label}: the email will skip “${first.title}”. This frequency already sent it.`;
  }
  return `${label}: ${first.title}.`;
}

function storyFromNews(item: LabosDigestFoundNews): LabosDigestStory {
  return {
    position: 0,
    source: 'admin',
    uid: item.uid,
    title: item.title,
    summary: null,
    sourceDomain: item.source,
    sourceUrl: '',
    eventDate: item.date,
    tags: item.tags,
    teamUid: '',
    teamName: '',
  };
}

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.5 14.5L10.5 10.5M11.5 6.5C11.5 9.26142 9.26142 11.5 6.5 11.5C3.73858 11.5 1.5 9.26142 1.5 6.5C1.5 3.73858 3.73858 1.5 6.5 1.5C9.26142 1.5 11.5 3.73858 11.5 6.5Z"
      stroke="#9CA3AF"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function LabosDigestPage() {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');
  const canOpen = !!user && isDirectoryAdmin;
  const digest = useLabosDigest(authToken, canOpen);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tags, setTags] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const news = useLabosDigestNews(authToken, canOpen, { page, from, to, tags, q: debouncedSearch });
  const save = useSaveLabosDigestPicks();
  const reset = useResetLabosDigestPicks();
  const [order, setOrder] = useState<LabosDigestStory[]>([]);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [detailUid, setDetailUid] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const detail = useLabosDigestNewsItem(authToken, detailUid);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (authToken && !isLoading && user && !isDirectoryAdmin) {
      router.replace('/access-denied');
    }
  }, [authToken, isLoading, user, isDirectoryAdmin, router]);

  useEffect(() => {
    if (digest.data) setOrder(digest.data.stories);
  }, [digest.data]);

  if (!canOpen) return null;

  const serverUids = digest.data?.stories.map((story) => story.uid) ?? [];
  const dirty = !sameOrder(
    order.map((story) => story.uid),
    serverUids
  );

  const move = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= order.length) return;
    const copy = order.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    setOrder(copy);
  };

  const applyFoundNews = (item: LabosDigestFoundNews) => {
    if (replaceIndex === null) return;
    if (order.some((story) => story.uid === item.uid)) return;
    const copy = order.slice();
    copy[replaceIndex] = storyFromNews(item);
    setOrder(copy);
    setReplaceIndex(null);
  };

  const pageCount = news.data ? Math.max(1, Math.ceil(news.data.total / news.data.limit)) : 1;

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <header className={s.header}>
          <div>
            <h1 className={s.title}>LabOS Digest</h1>
            <p className={s.subtitle}>
              One list for the next daily digest and the next weekly digest. The email highlights the first story.
            </p>
          </div>
          {digest.data && (
            <span className={clsx(s.badge, digest.data.source === 'admin' && s.badgeAdmin)}>
              {digest.data.source === 'admin' ? 'Admin picks' : 'AI picks'}
            </span>
          )}
        </header>

        <section className={s.panel}>
          <div className={s.panelBody}>
            {digest.isLoading && <p className={s.status}>Loading top stories...</p>}
            {digest.isError && <p className={clsx(s.status, s.error)}>Failed to load top stories.</p>}

            {digest.data && (
              <>
                <p className={s.lead}>{leadLine('Next daily email lead', digest.data, 'daily')}</p>
                <p className={s.lead}>{leadLine('Next weekly email lead', digest.data, 'weekly')}</p>
                <ol className={s.storyList}>
                  {order.map((story, index) => (
                    <li key={story.uid} className={s.story}>
                      <div>
                        <button type="button" className={s.titleButton} onClick={() => setDetailUid(story.uid)}>
                          {index + 1}. {story.title}
                        </button>
                        <p className={s.storyMeta}>
                          {story.sourceDomain || 'Unknown source'} · {day(story.eventDate)} ·{' '}
                          {story.tags.join(', ') || 'No tags'}
                        </p>
                      </div>
                      <div className={s.actions}>
                        <button
                          type="button"
                          className={s.textButton}
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className={s.textButton}
                          onClick={() => move(index, 1)}
                          disabled={index === order.length - 1}
                        >
                          Move down
                        </button>
                        <button type="button" className={s.textButton} onClick={() => setReplaceIndex(index)}>
                          Replace
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className={s.footerActions}>
                  <button
                    type="button"
                    className={s.primaryButton}
                    disabled={!dirty || save.isLoading}
                    onClick={() => save.mutate({ authToken, newsItemUids: order.map((story) => story.uid) })}
                  >
                    Save
                  </button>
                  {digest.data.source === 'admin' && (
                    <button
                      type="button"
                      className={s.secondaryButton}
                      disabled={reset.isLoading}
                      onClick={() => reset.mutate({ authToken })}
                    >
                      Reset
                    </button>
                  )}
                </div>
                {replaceIndex !== null && (
                  <p className={s.hint}>Choose a found story to replace slot {replaceIndex + 1}.</p>
                )}
              </>
            )}
          </div>
        </section>

        <section className={s.panel}>
          <div className={s.panelBody}>
            <div className={s.header}>
              <h2 className={s.sectionTitle}>Found news</h2>
              <button type="button" className={s.primaryButton} onClick={() => setPostOpen(true)}>
                Post news
              </button>
            </div>
            <div className={s.toolbar}>
              <div className={s.searchWrapper}>
                <span className={s.searchIcon}>
                  <SearchIcon />
                </span>
                <input
                  className={s.searchInput}
                  placeholder="Search title or content"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <label className={s.fieldLabel}>
                From
                <input
                  className={s.field}
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className={s.fieldLabel}>
                To
                <input
                  className={s.field}
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className={s.fieldLabel}>
                Tags
                <input
                  className={s.field}
                  value={tags}
                  placeholder="ai, funding"
                  onChange={(event) => {
                    setTags(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>

            {news.isLoading && <p className={s.status}>Loading found news...</p>}
            {news.isError && <p className={clsx(s.status, s.error)}>Failed to load found news.</p>}

            {news.data && (
              <>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Description</th>
                      <th>Source</th>
                      <th>Date</th>
                      <th>Tags</th>
                      <th>Past top story</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {news.data.items.length === 0 && (
                      <tr>
                        <td colSpan={7}>No stories match these filters.</td>
                      </tr>
                    )}
                    {news.data.items.map((item) => (
                      <tr key={item.uid}>
                        <td>
                          <button type="button" className={s.titleButton} onClick={() => setDetailUid(item.uid)}>
                            {item.title}
                          </button>
                        </td>
                        <td className={s.description}>{item.summary || '—'}</td>
                        <td>{item.source || '—'}</td>
                        <td>{day(item.date)}</td>
                        <td>
                          {item.tags.length === 0
                            ? '—'
                            : item.tags.map((tag) => (
                                <span key={tag} className={s.tag}>
                                  {tag}
                                </span>
                              ))}
                        </td>
                        <td>
                          {item.wasTopStory
                            ? item.topStoryHistory
                                .map((entry) => `${entry.frequency}${entry.isLead ? ' lead' : ''} ${day(entry.sentAt)}`)
                                .join(', ')
                            : 'No'}
                        </td>
                        <td>
                          {replaceIndex !== null && (
                            <button type="button" className={s.textButton} onClick={() => applyFoundNews(item)}>
                              Use
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className={s.pager}>
                  <button
                    type="button"
                    className={s.secondaryButton}
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {news.data.page} of {pageCount}
                  </span>
                  <button
                    type="button"
                    className={s.secondaryButton}
                    disabled={page * news.data.limit >= news.data.total}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
        {detailUid && (
          <NewsDetailModal
            authToken={authToken}
            item={detail.data}
            isLoading={detail.isLoading}
            isError={detail.isError}
            onClose={() => setDetailUid(null)}
          />
        )}
        {postOpen && <PostNewsModal authToken={authToken} onClose={() => setPostOpen(false)} />}
      </div>
    </ApprovalLayout>
  );
}
