import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useAuth } from '../../context/auth-context';
import { RichText } from '../../components/common/rich-text';
import { AddSpvParticipantModal } from '../../components/spv-spotlights/AddSpvParticipantModal';
import api from '../../utils/api';
import { API_ROUTE, WEB_UI_BASE_URL } from '../../utils/constants';

import s from '../demo-days/styles.module.scss';

const RichTextEditor = dynamic(() => import('../../components/common/rich-text-editor'), { ssr: false });

type TemplateKey =
  | 'invitePreapproved'
  | 'followUpPreapproved'
  | 'inviteOutreach'
  | 'followUpOutreach'
  | 'approved'
  | 'opened';

const TEMPLATE_LABELS: { key: TemplateKey; label: string }[] = [
  { key: 'invitePreapproved', label: 'Invite, pre-approved' },
  { key: 'followUpPreapproved', label: 'Follow-up, pre-approved' },
  { key: 'inviteOutreach', label: 'Invite, outreach' },
  { key: 'followUpOutreach', label: 'Follow-up, outreach' },
  { key: 'approved', label: 'Application approved' },
  { key: 'opened', label: 'Spotlight is open' },
];

type MediaItem = { imageUid: string; alt: string; fit: 'cover' | 'contain'; url?: string };
type Participant = {
  uid: string;
  type: string;
  access: string;
  cohort: string | null;
  inviteSentCount: number;
  followUpSentCount: number;
  emailTemplateVariables: Record<string, string> | null;
  member: { uid: string; name: string | null; email: string | null };
};
type AccessRequest = {
  uid: string;
  status: string;
  role: string;
  organization: string;
  isAccreditedInvestor: boolean;
  createdAt: string;
  member: { name: string | null; email: string | null };
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'OPEN':
      return 'text-green-600 bg-green-100';
    case 'CLOSED':
      return 'text-red-600 bg-red-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
};

const SpvSpotlightDetailPage = () => {
  const router = useRouter();
  const uid = typeof router.query.uid === 'string' ? router.query.uid : '';
  const [authToken] = useCookie('plnadmin');
  const { canViewTeamPitches, canMutateTeamPitches, isLoading } = useAuth();
  const [tab, setTab] = useState<'applications' | 'investors' | 'founders' | 'templates'>('applications');
  const [isEditing, setIsEditing] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [spotlight, setSpotlight] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [templates, setTemplates] = useState<Record<TemplateKey, { subject: string; body: string }> | null>(null);
  const [variablesDraft, setVariablesDraft] = useState<Record<string, string>>({});

  const authHeaders = { authorization: `Bearer ${authToken}` };
  const base = `${API_ROUTE.ADMIN_SPV_SPOTLIGHTS}/${uid}`;

  const load = useCallback(async () => {
    if (!authToken || !uid) return;
    const { data } = await api.get(base, { headers: authHeaders });
    setSpotlight(data);
    setForm({
      title: data.title ?? '',
      description: data.description ?? '',
      slug: data.slug ?? '',
      status: data.status ?? 'DRAFT',
      supportEmail: data.supportEmail ?? '',
      senderName: data.senderName ?? '',
      senderEmail: data.senderEmail ?? '',
      replyToEmail: data.replyToEmail ?? '',
      docSendUrl: data.docSendUrl ?? '',
      summary: data.summary ?? '',
    });
    setMedia(
      (data.media ?? []).map((item: { imageUid: string; alt: string; fit: string; image?: { url: string } }) => ({
        imageUid: item.imageUid,
        alt: item.alt,
        fit: item.fit === 'contain' ? 'contain' : 'cover',
        url: item.image?.url,
      }))
    );
    setTemplates(data.emailTemplates);
  }, [authToken, uid]);

  const loadRequests = useCallback(async () => {
    if (!authToken || !uid) return;
    const { data } = await api.get(`${base}/access-requests`, { headers: authHeaders });
    setRequests(data);
  }, [authToken, uid]);

  const loadParticipants = useCallback(async () => {
    if (!authToken || !uid) return;
    const { data } = await api.get(`${base}/participants`, { headers: authHeaders });
    setParticipants(data);
    const drafts: Record<string, string> = {};
    for (const participant of data as Participant[]) {
      drafts[participant.uid] = JSON.stringify(participant.emailTemplateVariables ?? {}, null, 2);
    }
    setVariablesDraft(drafts);
  }, [authToken, uid]);

  useEffect(() => {
    if (!authToken) router.replace(`/?backlink=${router.asPath}`);
  }, [authToken, router]);

  useEffect(() => {
    if (!isLoading && authToken && !canViewTeamPitches) router.replace('/');
  }, [authToken, canViewTeamPitches, isLoading, router]);

  useEffect(() => {
    load().catch(() => alert('Failed to load spotlight'));
  }, [load]);

  useEffect(() => {
    if (tab === 'applications') loadRequests().catch(() => undefined);
    if (tab === 'applications' || tab === 'investors' || tab === 'founders') {
      loadParticipants().catch(() => undefined);
    }
  }, [tab, loadRequests, loadParticipants]);

  const statusWarning = form.status && form.status !== 'OPEN' ? `This spotlight is ${form.status}. The link will show that page.` : '';

  const saveContent = async (event: React.FormEvent) => {
    event.preventDefault();
    await api.patch(
      base,
      {
        ...form,
        supportEmail: form.supportEmail || null,
        senderEmail: form.senderEmail || null,
        senderName: form.senderName || null,
        replyToEmail: form.replyToEmail || null,
        docSendUrl: form.docSendUrl || null,
        summary: form.summary || null,
        media: media.map(({ imageUid, alt, fit }) => ({ imageUid, alt, fit })),
      },
      { headers: authHeaders }
    );
    await load();
    setIsEditing(false);
    alert('Saved');
  };

  const uploadImage = async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    const response = await api.post('/v1/images', body, { headers: { 'content-type': 'multipart/form-data' } });
    const image = response.data.image ?? response.data;
    setMedia((current) => [...current, { imageUid: image.uid, alt: file.name, fit: 'cover', url: image.url }]);
  };

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return [];
    const headers = lines[0].split(',').map((header) => header.trim());
    const emailIndex = Math.max(headers.findIndex((header) => header.toLowerCase() === 'email'), 0);
    const nameIndex = headers.findIndex((header) => header.toLowerCase() === 'name');
    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((cell) => cell.trim());
      const emailTemplateVariables: Record<string, string> = {};
      headers.forEach((header, index) => {
        const key = header.toLowerCase();
        if (index === emailIndex || key === 'name' || !header) return;
        if (cells[index]) emailTemplateVariables[header] = cells[index];
      });
      return {
        email: cells[emailIndex],
        name: nameIndex >= 0 ? cells[nameIndex] : undefined,
        emailTemplateVariables,
      };
    }).filter((row) => row.email);
  };

  const uploadCohort = async (cohort: 'PRE_APPROVED' | 'OUTREACH', file: File) => {
    const participants = parseCsv(await file.text());
    if (!participants.length) {
      alert('No rows with an email column were found.');
      return;
    }
    await api.post(`${base}/participants-bulk`, { cohort, participants }, { headers: authHeaders });
    await loadParticipants();
    alert(`Uploaded ${participants.length} ${cohort === 'PRE_APPROVED' ? 'pre-approved' : 'outreach'} investors.`);
  };

  const sendBulk = async (kind: 'invites' | 'follow-ups', includeAlready: boolean) => {
    if (statusWarning && !confirm(statusWarning + ' Send anyway?')) return;
    const investors = participants.filter((participant) => participant.type === 'INVESTOR');
    const cohorts = new Set(investors.map((participant) => participant.cohort));
    if (cohorts.size > 1) {
      alert('This selection includes both cohorts. Each person gets their own template.');
    }
    const path = kind === 'invites' ? 'send-invites-bulk' : 'send-follow-ups-bulk';
    const body = kind === 'invites' ? { includeAlreadyInvited: includeAlready } : { includeAlreadyFollowedUp: includeAlready };
    const { data } = await api.post(`${base}/participants/${path}`, body, { headers: authHeaders });
    alert(`Sent ${data.summary.sent}, skipped ${data.summary.skipped}, errors ${data.summary.errors}`);
    await loadParticipants();
  };

  const exportLinks = async () => {
    if (statusWarning && !confirm(statusWarning + ' Export anyway?')) return;
    const { data } = await api.get(`${base}/login-links`, { headers: authHeaders });
    const lines = ['email,name,cohort,url', ...data.rows.map((row: { email: string; name: string; cohort: string; url: string }) =>
      [row.email, row.name, row.cohort, row.url].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')
    )];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'spv-login-links.csv';
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const sendOpenNotice = async () => {
    const preview = await api.get(`${base}/open-notice`, { headers: authHeaders });
    if (!confirm(
      `${preview.data.willReceive} approved investors will receive this now. ${preview.data.alreadySent} already received it.`
    )) {
      return;
    }
    if (statusWarning && !confirm(statusWarning)) return;
    const { data } = await api.post(`${base}/open-notice`, { includeAlreadySent: false }, { headers: authHeaders });
    alert(`Sent ${data.summary.sent}`);
  };

  const resendOpenNotice = async () => {
    const preview = await api.get(`${base}/open-notice`, { headers: authHeaders });
    if (!confirm(`Resend to everyone, including ${preview.data.alreadySent} who already received it?`)) return;
    if (statusWarning && !confirm(statusWarning)) return;
    const { data } = await api.post(`${base}/open-notice`, { includeAlreadySent: true }, { headers: authHeaders });
    alert(`Sent ${data.summary.sent}`);
  };

  if (!authToken || isLoading) return null;

  if (!spotlight) {
    return (
      <ApprovalLayout>
        <div className={clsx(s.root, s.wide)}>
          <div className={s.loadingState}>Loading SPV spotlight details...</div>
        </div>
      </ApprovalLayout>
    );
  }

  const team = spotlight.team as { uid: string; name: string };
  const investors = participants.filter((participant) => participant.type === 'INVESTOR');
  const founders = participants.filter((participant) => participant.type === 'FOUNDER');
  const query = listSearch.trim().toLowerCase();
  const matchesPerson = (name?: string | null, email?: string | null) =>
    !query || `${name ?? ''} ${email ?? ''}`.toLowerCase().includes(query);
  const visibleRequests = requests.filter((request) => matchesPerson(request.member.name, request.member.email));
  const visibleInvestors = investors.filter((participant) =>
    matchesPerson(participant.member.name, participant.member.email)
  );
  const visibleFounders = founders.filter((participant) =>
    matchesPerson(participant.member.name, participant.member.email)
  );
  const publicUrl = `${WEB_UI_BASE_URL}/spv-spotlight/${form.slug || spotlight.slug}`;

  const cancelEdit = () => {
    setForm({
      title: String(spotlight.title ?? ''),
      description: String(spotlight.description ?? ''),
      slug: String(spotlight.slug ?? ''),
      status: String(spotlight.status ?? 'DRAFT'),
      supportEmail: String(spotlight.supportEmail ?? ''),
      senderName: String(spotlight.senderName ?? ''),
      senderEmail: String(spotlight.senderEmail ?? ''),
      replyToEmail: String(spotlight.replyToEmail ?? ''),
      docSendUrl: String(spotlight.docSendUrl ?? ''),
      summary: String(spotlight.summary ?? ''),
    });
    setMedia(
      ((spotlight.media as { imageUid: string; alt: string; fit: string; image?: { url: string } }[]) ?? []).map(
        (item) => ({
          imageUid: item.imageUid,
          alt: item.alt,
          fit: item.fit === 'contain' ? 'contain' : 'cover',
          url: item.image?.url,
        })
      )
    );
    setIsEditing(false);
  };

  const textField = (key: keyof typeof form, label: string, hint?: string) => (
    <div className={s.overviewField}>
      <label className={s.fieldLabel}>{label}</label>
      {isEditing ? (
        <input
          type="text"
          value={form[key] ?? ''}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className={s.fieldInput}
        />
      ) : (
        <div className={s.fieldValue}>{form[key] || '—'}</div>
      )}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );

  return (
    <ApprovalLayout>
      <div className={clsx(s.root, s.wide)}>
        <div className={s.backButton}>
          <button onClick={() => router.push('/spv-spotlights')} className="mb-4 text-blue-600 hover:text-blue-800">
            ← Back to SPV Spotlights
          </button>
        </div>

        <div className={s.header}>
          <div>
            <span className={s.title}>{String(spotlight.title)}</span>
            {team?.name && (
              <p className="mt-1 text-sm text-gray-500">
                Team:{' '}
                <a
                  href={`${WEB_UI_BASE_URL}/teams/${team.uid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  {team.name}
                </a>
              </p>
            )}
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor(String(spotlight.status))}`}>
            {String(spotlight.status)}
          </span>
        </div>

        <div className={s.body}>
          <form className={s.overview} onSubmit={saveContent}>
            <div className={s.overviewHeader}>
              <h2 className={s.overviewTitle}>Overview</h2>
              {canMutateTeamPitches &&
                (!isEditing ? (
                  <button type="button" onClick={() => setIsEditing(true)} className={s.editButton}>
                    Edit
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button type="button" onClick={cancelEdit} className={s.editButton}>
                      Cancel
                    </button>
                    <button type="submit" className={clsx(s.editButton, s.primary)}>
                      Save
                    </button>
                  </div>
                ))}
            </div>
            <div className={s.overviewGrid}>
              {textField('title', 'Title')}
              {textField('slug', 'URL Slug')}
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Status</label>
                {isEditing ? (
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className={s.fieldInput}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="OPEN">Open</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                ) : (
                  <div className={s.fieldValue}>{form.status}</div>
                )}
                <p className="text-xs text-gray-500">Changing status does not send email.</p>
              </div>
              {textField('supportEmail', 'Support Email', 'Leave blank to use the default support email.')}
              {textField('senderEmail', 'Sender Email', 'From address used for investor invite and follow-up emails.')}
              {textField('senderName', 'Sender Name')}
              {textField('replyToEmail', 'Reply-To Email')}
              {textField('docSendUrl', 'DocSend URL')}
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Summary</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={form.summary}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    className={s.fieldInput}
                  />
                ) : (
                  <div className={s.fieldValue}>{form.summary || '—'}</div>
                )}
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Description</label>
                {isEditing ? (
                  <RichTextEditor
                    id="spv-description"
                    value={form.description}
                    onChange={(description: string) => setForm({ ...form, description })}
                  />
                ) : (
                  <div className={s.fieldValue}>
                    <RichText text={form.description ?? ''} />
                  </div>
                )}
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Media</label>
                <div className="flex w-full flex-col gap-3">
                  {media.map((item, index) => (
                    <div key={`${item.imageUid}-${index}`} className="flex items-center gap-3">
                      {item.url && (
                        <img src={item.url} alt={item.alt} className="h-16 w-24 rounded border border-gray-200 object-cover" />
                      )}
                      {isEditing ? (
                        <>
                          <input
                            className={s.fieldInput}
                            value={item.alt}
                            onChange={(e) => {
                              const next = [...media];
                              next[index] = { ...item, alt: e.target.value };
                              setMedia(next);
                            }}
                          />
                          <select
                            className={s.filterSelect}
                            value={item.fit}
                            onChange={(e) => {
                              const next = [...media];
                              next[index] = { ...item, fit: e.target.value === 'contain' ? 'contain' : 'cover' };
                              setMedia(next);
                            }}
                          >
                            <option value="cover">Cover</option>
                            <option value="contain">Contain</option>
                          </select>
                          <button
                            type="button"
                            className="text-sm text-red-600"
                            onClick={() => setMedia(media.filter((_, i) => i !== index))}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <div className={s.fieldValue}>
                          {item.alt || 'Untitled'} · {item.fit}
                        </div>
                      )}
                    </div>
                  ))}
                  {media.length === 0 && !isEditing && <div className={s.fieldValue}>—</div>}
                  {isEditing && canMutateTeamPitches && (
                    <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
                      Upload image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadImage(file).catch(() => alert('Upload failed'));
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Spotlight Page URL</label>
                <div className={s.fieldValue}>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 hover:text-blue-800">
                    {publicUrl}
                  </a>
                </div>
              </div>
            </div>
          </form>

          <div className={s.participants}>
            <div className={s.participantsHeader}>
              <div className={s.participantsHeaderTop}>
                <h2 className={s.participantsTitle}>
                  {tab === 'templates' ? 'Email templates' : 'Participants'}
                </h2>
                {canMutateTeamPitches && (tab === 'investors' || tab === 'founders') && (
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddParticipant(true)}
                        className={clsx(s.editButton, s.primary)}
                      >
                        Add Participant
                      </button>
                      {tab === 'investors' && (
                        <>
                          <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700">
                            Upload pre-approved CSV
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadCohort('PRE_APPROVED', file).catch(() => alert('Upload failed'));
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <label className="cursor-pointer rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700">
                            Upload outreach CSV
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadCohort('OUTREACH', file).catch(() => alert('Upload failed'));
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <button type="button" onClick={() => exportLinks()} className={s.editButton}>
                            Export login links
                          </button>
                        </>
                      )}
                    </div>
                    {tab === 'investors' && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => sendBulk('invites', false)} className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
                          Send Invites
                        </button>
                        <button type="button" onClick={() => sendBulk('invites', true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
                          Resend Invites
                        </button>
                        <button type="button" onClick={() => sendBulk('follow-ups', false)} className="rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700">
                          Send Follow-ups
                        </button>
                        <button type="button" onClick={() => sendBulk('follow-ups', true)} className="rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700">
                          Resend Follow-ups
                        </button>
                        <button type="button" onClick={() => sendOpenNotice()} className={s.editButton}>
                          Email that spotlight is open
                        </button>
                        <button type="button" onClick={() => resendOpenNotice()} className={s.editButton}>
                          Resend open notice
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={s.tabs}>
                {(
                  [
                    ['applications', 'Applications', requests.length],
                    ['investors', 'Investors', investors.length],
                    ['founders', 'Founders', founders.length],
                    ['templates', 'Templates', null],
                  ] as const
                ).map(([item, label, count]) => (
                  <button
                    key={item}
                    type="button"
                    className={clsx(s.tab, { [s.active]: tab === item })}
                    onClick={() => setTab(item)}
                  >
                    {label}
                    {count !== null && tab === item ? ` (${count})` : ''}
                  </button>
                ))}
              </div>

              {tab !== 'templates' && (
                <div className={s.participantsFilters}>
                  <input
                    type="text"
                    placeholder="Search by name or email"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    className={s.input}
                  />
                </div>
              )}
            </div>
          </div>

          {tab === 'applications' && (
            <div className={s.participantsTable}>
              {visibleRequests.length === 0 ? (
                <div className={s.emptyState}>No applications found</div>
              ) : (
                <div className={s.table}>
                  <div className={clsx(s.tableRow, s.tableHeader)}>
                    <div className={clsx(s.headerCell, s.first, s.flexible)}>Member</div>
                    <div className={clsx(s.headerCell, s.flexible)}>Role</div>
                    <div className={clsx(s.headerCell, s.flexible)}>Organization</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 110 }}>Accredited</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 120 }}>Status</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 140 }}>Actions</div>
                  </div>
                  {visibleRequests.map((request) => (
                    <div key={request.uid} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.first, s.flexible)}>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{request.member.name || '—'}</div>
                          <div className="text-sm text-gray-500">{request.member.email}</div>
                        </div>
                      </div>
                      <div className={clsx(s.bodyCell, s.flexible)}>{request.role}</div>
                      <div className={clsx(s.bodyCell, s.flexible)}>{request.organization}</div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 110 }}>
                        {request.isAccreditedInvestor ? 'Yes' : 'No'}
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 120 }}>{request.status}</div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 140 }}>
                        {canMutateTeamPitches && request.status !== 'APPROVED' && (
                          <button
                            type="button"
                            className="text-sm text-blue-600 hover:text-blue-800"
                            onClick={() =>
                              api
                                .post(`${base}/access-requests/${request.uid}/approve`, {}, { headers: authHeaders })
                                .then(loadRequests)
                            }
                          >
                            Approve
                          </button>
                        )}
                        {canMutateTeamPitches && request.status === 'PENDING' && (
                          <button
                            type="button"
                            className="ml-3 text-sm text-red-600 hover:text-red-800"
                            onClick={() =>
                              api
                                .post(`${base}/access-requests/${request.uid}/reject`, {}, { headers: authHeaders })
                                .then(loadRequests)
                            }
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'investors' && (
            <div className={s.participantsTable}>
              {visibleInvestors.length === 0 ? (
                <div className={s.emptyState}>No participants found</div>
              ) : (
                <div className={s.table}>
                  <div className={clsx(s.tableRow, s.tableHeader)}>
                    <div className={clsx(s.headerCell, s.first, s.flexible)}>Member</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 140 }}>Cohort</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 120 }}>Access</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 90 }}>Invites</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 110 }}>Follow-up</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 220 }}>Template vars</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 110 }}>Actions</div>
                  </div>
                  {visibleInvestors.map((participant) => (
                    <div key={participant.uid} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.first, s.flexible)}>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{participant.member.name || '—'}</div>
                          <div className="text-sm text-gray-500">{participant.member.email}</div>
                        </div>
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 140 }}>{participant.cohort || '—'}</div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 120 }}>{participant.access}</div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 90 }}>{participant.inviteSentCount}</div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 110 }}>{participant.followUpSentCount}</div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 220 }}>
                        <textarea
                          className={s.fieldTextarea}
                          rows={3}
                          value={variablesDraft[participant.uid] ?? ''}
                          onChange={(e) => setVariablesDraft({ ...variablesDraft, [participant.uid]: e.target.value })}
                        />
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 110 }}>
                        <button
                          type="button"
                          className="text-sm text-blue-600 hover:text-blue-800"
                          onClick={() => {
                            const emailTemplateVariables = JSON.parse(variablesDraft[participant.uid] || '{}');
                            api
                              .patch(`${base}/participants/${participant.uid}`, { emailTemplateVariables }, { headers: authHeaders })
                              .then(loadParticipants);
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="ml-3 text-sm text-red-600 hover:text-red-800"
                          onClick={() =>
                            api.delete(`${base}/participants/${participant.uid}`, { headers: authHeaders }).then(loadParticipants)
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'founders' && (
            <div className={s.participantsTable}>
              {visibleFounders.length === 0 ? (
                <div className={s.emptyState}>No team leads were on this team when the spotlight was created.</div>
              ) : (
                <div className={s.table}>
                  <div className={clsx(s.tableRow, s.tableHeader)}>
                    <div className={clsx(s.headerCell, s.first, s.flexible)}>Member</div>
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 160 }}>Access</div>
                  </div>
                  {visibleFounders.map((founder) => (
                    <div key={founder.uid} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.first, s.flexible)}>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{founder.member.name || '—'}</div>
                          <div className="text-sm text-gray-500">{founder.member.email}</div>
                        </div>
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 160 }}>{founder.access}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'templates' && templates && (
            <form
              className={s.overview}
              onSubmit={async (event) => {
                event.preventDefault();
                await api.patch(`${base}/email-templates`, { templates }, { headers: authHeaders });
                alert('Templates saved');
              }}
            >
              <div className={s.overviewHeader}>
                <h2 className={s.overviewTitle}>Templates</h2>
                {canMutateTeamPitches && (
                  <button type="submit" className={clsx(s.editButton, s.primary)}>
                    Save
                  </button>
                )}
              </div>
              <p className="mb-6 text-sm text-gray-500">
                Built-in tokens: investorName, investorEmail, spotlightTitle, spotlightLink, teamName, supportEmail.
                Invite and follow-up emails also replace extra CSV columns, using the column header as the token.
                Approval emails also have role and organization. HTML is allowed.
              </p>
              <div className="flex flex-col gap-6">
                {TEMPLATE_LABELS.map(({ key, label }) => (
                  <div key={key} className={clsx(s.overviewField, 'w-full')}>
                    <label className={s.fieldLabel}>{label}</label>
                    <input
                      className={clsx(s.fieldInput, 'box-border w-full self-stretch')}
                      value={templates[key].subject}
                      onChange={(e) => setTemplates({ ...templates, [key]: { ...templates[key], subject: e.target.value } })}
                    />
                    <textarea
                      className={clsx(s.fieldTextarea, 'min-h-[160px]')}
                      value={templates[key].body}
                      onChange={(e) => setTemplates({ ...templates, [key]: { ...templates[key], body: e.target.value } })}
                    />
                  </div>
                ))}
              </div>
            </form>
          )}
        </div>
      </div>
      <AddSpvParticipantModal
        isOpen={showAddParticipant}
        onClose={() => setShowAddParticipant(false)}
        spotlightUid={uid}
        defaultType={tab === 'founders' ? 'FOUNDER' : 'INVESTOR'}
        onAdded={() => loadParticipants()}
      />
    </ApprovalLayout>
  );
};

export default SpvSpotlightDetailPage;
