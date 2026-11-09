import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import {
  useLabosDigest,
  useLabosDigestNews,
  useResetLabosDigestPicks,
  useSaveLabosDigestPicks,
} from '../../hooks/labos-digest/useLabosDigest';
import type { LabosDigestFoundNews, LabosDigestStory, LabosDigestView } from './types';

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
  const [applied, setApplied] = useState({ from: '', to: '', tags: '' });
  const news = useLabosDigestNews(authToken, canOpen, { page, ...applied });
  const save = useSaveLabosDigestPicks();
  const reset = useResetLabosDigestPicks();
  const [order, setOrder] = useState<LabosDigestStory[]>([]);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

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

  return (
    <ApprovalLayout>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">LabOS Digest</h1>
            <p className="text-sm text-gray-500">
              One list for the next daily digest and the next weekly digest. The email highlights the first story.
            </p>
          </div>
          {digest.data && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
              {digest.data.source === 'admin' ? 'Admin picks' : 'AI picks'}
            </span>
          )}
        </div>

        {digest.isLoading && <p className="text-sm text-gray-500">Loading top stories...</p>}
        {digest.isError && <p className="text-sm text-red-600">Failed to load top stories.</p>}

        {digest.data && (
          <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-700">{leadLine('Next daily email lead', digest.data, 'daily')}</p>
            <p className="mt-1 text-sm text-gray-700">{leadLine('Next weekly email lead', digest.data, 'weekly')}</p>
            <ol className="mt-4 space-y-2">
              {order.map((story, index) => (
                <li
                  key={story.uid}
                  className="flex items-center justify-between gap-3 rounded border border-gray-100 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {index + 1}. {story.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {story.sourceDomain || 'Unknown source'} · {day(story.eventDate)} ·{' '}
                      {story.tags.join(', ') || 'No tags'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-sm text-gray-700"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="text-sm text-gray-700"
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1}
                    >
                      Move down
                    </button>
                    <button type="button" className="text-sm text-gray-700" onClick={() => setReplaceIndex(index)}>
                      Replace
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                disabled={!dirty || save.isLoading}
                onClick={() => save.mutate({ authToken, newsItemUids: order.map((story) => story.uid) })}
              >
                Save
              </button>
              {digest.data.source === 'admin' && (
                <button
                  type="button"
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800"
                  disabled={reset.isLoading}
                  onClick={() => reset.mutate({ authToken })}
                >
                  Reset
                </button>
              )}
            </div>
            {replaceIndex !== null && (
              <p className="mt-3 text-sm text-gray-600">Choose a found story to replace slot {replaceIndex + 1}.</p>
            )}
          </section>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">Found news</h2>
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setApplied({ from, to, tags });
            }}
          >
            <label className="text-sm text-gray-700">
              From
              <input
                className="mt-1 block rounded border border-gray-300 px-2 py-1"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="text-sm text-gray-700">
              To
              <input
                className="mt-1 block rounded border border-gray-300 px-2 py-1"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <label className="text-sm text-gray-700">
              Tags
              <input
                className="mt-1 block rounded border border-gray-300 px-2 py-1"
                value={tags}
                placeholder="ai, funding"
                onChange={(event) => setTags(event.target.value)}
              />
            </label>
            <button type="submit" className="rounded border border-gray-300 px-3 py-1.5 text-sm">
              Apply
            </button>
          </form>

          {news.isLoading && <p className="mt-4 text-sm text-gray-500">Loading found news...</p>}
          {news.isError && <p className="mt-4 text-sm text-red-600">Failed to load found news.</p>}

          {news.data && (
            <>
              <table className="mt-4 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-3 font-medium">Title</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Tags</th>
                    <th className="py-2 pr-3 font-medium">Past top story</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {news.data.items.map((item) => (
                    <tr key={item.uid} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{item.title}</td>
                      <td className="py-2 pr-3">{item.source || '—'}</td>
                      <td className="py-2 pr-3">{day(item.date)}</td>
                      <td className="py-2 pr-3">{item.tags.join(', ') || '—'}</td>
                      <td className="py-2 pr-3">
                        {item.wasTopStory
                          ? item.topStoryHistory
                              .map((entry) => `${entry.frequency}${entry.isLead ? ' lead' : ''} ${day(entry.sentAt)}`)
                              .join(', ')
                          : 'No'}
                      </td>
                      <td className="py-2">
                        {replaceIndex !== null && (
                          <button type="button" className="text-sm text-gray-800" onClick={() => applyFoundNews(item)}>
                            Use
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </button>
                <span>
                  Page {news.data.page} of {Math.max(1, Math.ceil(news.data.total / news.data.limit))}
                </span>
                <button
                  type="button"
                  disabled={page * news.data.limit >= news.data.total}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </ApprovalLayout>
  );
}
