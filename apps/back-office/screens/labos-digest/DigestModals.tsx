import React, { useEffect, useState } from 'react';
import Modal from '../../components/modal/modal';
import { fetchTeamsForAutocomplete } from '../../utils/services/team';
import { usePostLabosDigestNews, useUpdateLabosDigestNews } from '../../hooks/labos-digest/useLabosDigest';
import type { LabosDigestNewsDetail } from './types';
import s from './LabosDigestPage.module.scss';

const day = (value: string) => value.slice(0, 10);

export function NewsDetailModal({
  authToken,
  item,
  isLoading,
  isError,
  onClose,
}: {
  authToken: string | undefined;
  item: LabosDigestNewsDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}) {
  const update = useUpdateLabosDigestNews();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sources, setSources] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setSummary(item.summary ?? '');
    setSources(item.sourceUrls.join('\n'));
    setError('');
  }, [item]);

  const save = async () => {
    if (!item) return;
    setError('');
    try {
      await update.mutateAsync({
        authToken,
        uid: item.uid,
        title,
        summary,
        sourceUrls: sources
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this story.');
    }
  };

  return (
    <Modal isOpen onClose={onClose} modalClassName="w-full max-w-2xl p-6">
      <h2 className={s.sectionTitle}>News story</h2>
      {isLoading && <p className={s.status}>Loading story...</p>}
      {isError && <p className={`${s.status} ${s.error}`}>Failed to load this story.</p>}
      {item && (
        <div className={s.form}>
          <p className={s.storyMeta}>
            {item.team.name} · {day(item.eventDate)}
            {item.tags.length > 0 ? ` · ${item.tags.join(', ')}` : ''}
          </p>
          <label className={s.fieldLabel}>
            Title
            <input className={s.field} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className={s.fieldLabel}>
            Description
            <textarea className={s.textarea} value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <label className={s.fieldLabel}>
            Sources
            <textarea
              className={s.textarea}
              value={sources}
              onChange={(event) => setSources(event.target.value)}
              placeholder="One https link per line"
            />
          </label>
          {item.contentHtml && (
            <div>
              <p className={s.fieldLabel}>Body</p>
              <div className={s.body} dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
            </div>
          )}
          {item.topStoryHistory.length > 0 && (
            <p className={s.storyMeta}>
              Past top story:{' '}
              {item.topStoryHistory
                .map((entry) => `${entry.frequency}${entry.isLead ? ' lead' : ''} ${day(entry.sentAt)}`)
                .join(', ')}
            </p>
          )}
          {error && <p className={`${s.status} ${s.error}`}>{error}</p>}
          <div className={s.footerActions}>
            <button type="button" className={s.primaryButton} disabled={update.isLoading} onClick={save}>
              Save
            </button>
            <button type="button" className={s.secondaryButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PostNewsModal({ authToken, onClose }: { authToken: string | undefined; onClose: () => void }) {
  const post = usePostLabosDigestNews();
  const [teamQuery, setTeamQuery] = useState('');
  const [teams, setTeams] = useState<Array<{ value: string; label: string }>>([]);
  const [teamUid, setTeamUid] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const term = teamQuery.trim();
    if (term.length < 2) {
      setTeams([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchTeamsForAutocomplete(term).then((rows) => setTeams(rows ?? []));
    }, 300);
    return () => clearTimeout(timer);
  }, [teamQuery]);

  const save = async () => {
    setError('');
    try {
      await post.mutateAsync({ authToken, teamUid, title, body, url });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post this story.');
    }
  };

  return (
    <Modal isOpen onClose={onClose} modalClassName="w-full max-w-2xl p-6">
      <h2 className={s.sectionTitle}>Post news</h2>
      <div className={s.form}>
        <label className={s.fieldLabel}>
          Team
          <input
            className={s.field}
            value={teamQuery}
            placeholder="Search teams"
            onChange={(event) => {
              setTeamQuery(event.target.value);
              setTeamUid('');
            }}
          />
        </label>
        {teams.length > 0 && (
          <ul className={s.teamList}>
            {teams.map((team) => (
              <li key={team.value}>
                <button
                  type="button"
                  className={team.value === teamUid ? s.teamSelected : s.textButton}
                  onClick={() => {
                    setTeamUid(team.value);
                    setTeamQuery(team.label);
                    setTeams([]);
                  }}
                >
                  {team.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className={s.fieldLabel}>
          Headline
          <input className={s.field} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className={s.fieldLabel}>
          Body
          <textarea className={s.textarea} value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className={s.fieldLabel}>
          Link
          <input className={s.field} value={url} placeholder="https://" onChange={(event) => setUrl(event.target.value)} />
        </label>
        {error && <p className={`${s.status} ${s.error}`}>{error}</p>}
        <div className={s.footerActions}>
          <button type="button" className={s.primaryButton} disabled={post.isLoading || !teamUid} onClick={save}>
            Post
          </button>
          <button type="button" className={s.secondaryButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
