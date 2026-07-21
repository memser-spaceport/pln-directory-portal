import React, { useEffect, useMemo, useState } from 'react';
import { ApprovalLayout } from '../../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import Image from 'next/image';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useAuth } from '../../../context/auth-context';
import { useTeamPitchDetail } from '../../../hooks/team-pitches/useTeamPitchDetail';
import { useTeamPitchParticipants } from '../../../hooks/team-pitches/useTeamPitchParticipants';
import { useUpdateTeamPitch } from '../../../hooks/team-pitches/useUpdateTeamPitch';
import { useUpdateTeamPitchParticipant } from '../../../hooks/team-pitches/useUpdateTeamPitchParticipant';
import { useSendTeamPitchInvite } from '../../../hooks/team-pitches/useSendTeamPitchInvite';
import { useSendTeamPitchInvitesBulk } from '../../../hooks/team-pitches/useSendTeamPitchInvitesBulk';
import { useSendTeamPitchFollowUp } from '../../../hooks/team-pitches/useSendTeamPitchFollowUp';
import { useSendTeamPitchFollowUpsBulk } from '../../../hooks/team-pitches/useSendTeamPitchFollowUpsBulk';
import { useRemoveTeamPitchParticipant } from '../../../hooks/team-pitches/useRemoveTeamPitchParticipant';
import { useRemoveTeamPitchParticipantsBulk } from '../../../hooks/team-pitches/useRemoveTeamPitchParticipantsBulk';
import { AddTeamPitchParticipantModal } from '../../../components/team-pitches/AddTeamPitchParticipantModal';
import { UploadTeamPitchInvestorsModal } from '../../../components/team-pitches/UploadTeamPitchInvestorsModal';
import { TeamPitchConfirmModal } from '../../../components/team-pitches/TeamPitchConfirmModal';
import { EditEmailTemplateVariablesModal } from '../../../components/team-pitches/EditEmailTemplateVariablesModal';
import { RichText } from '../../../components/common/rich-text';
import { WEB_UI_BASE_URL } from '../../../utils/constants';
import { toast } from 'react-toastify';

import s from '../../demo-days/styles.module.scss';

const RichTextEditor = dynamic(() => import('../../../components/common/rich-text-editor'), { ssr: false });

const formatFollowUpDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatTemplateVariablesPreview = (vars: Record<string, string> | null | undefined) => {
  if (!vars || Object.keys(vars).length === 0) return null;
  return JSON.stringify(vars);
};

const ACCESS_OPTIONS = ['VIEW', 'VIEW_ADMIN', 'EDIT', 'RESTRICTED'] as const;

const ACCESS_LABELS: Record<typeof ACCESS_OPTIONS[number], string> = {
  VIEW: 'View Open Spotlight',
  VIEW_ADMIN: 'View Draft + Open Spotlight',
  EDIT: 'Admin (View/Edit)',
  RESTRICTED: 'No Access',
};

const getParticipantTypeSelectClass = (type: string) => {
  switch (type) {
    case 'INVESTOR':
      return 'bg-purple-100 text-purple-800';
    case 'FOUNDER':
      return 'bg-blue-100 text-blue-800';
    case 'SUPPORT':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

const getAccessSelectClass = (access: string) => {
  switch (access) {
    case 'EDIT':
      return 'bg-green-100 text-green-800';
    case 'VIEW':
      return 'bg-blue-100 text-blue-800';
    case 'VIEW_ADMIN':
      return 'bg-indigo-100 text-indigo-800';
    case 'RESTRICTED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

const INVESTOR_TYPE_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  ANGEL: { label: 'Angel', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  FUND: { label: 'Fund', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  ANGEL_AND_FUND: { label: 'Angel + Fund', bgColor: 'bg-purple-100', textColor: 'text-purple-800' },
};

type PendingParticipantFields = {
  uid: string;
  name?: string;
  email?: string;
};

const formatParticipantTypeLabel = (type: string) => type.charAt(0) + type.slice(1).toLowerCase();

const formatAccessLabel = (access: string) => ACCESS_LABELS[access as typeof ACCESS_OPTIONS[number]] ?? access;

const TeamExternalLinkIcon = () => (
  <svg className="ml-1 w-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
    <path
      d="M12.5003 4V10.5C12.5003 10.6326 12.4476 10.7598 12.3538 10.8536C12.2601 10.9473 12.1329 11 12.0003 11C11.8677 11 11.7405 10.9473 11.6467 10.8536C11.553 10.7598 11.5003 10.6326 11.5003 10.5V5.20687L4.35403 12.3538C4.26021 12.4476 4.13296 12.5003 4.00028 12.5003C3.8676 12.5003 3.74035 12.4476 3.64653 12.3538C3.55271 12.2599 3.5 12.1327 3.5 12C3.5 11.8673 3.55271 11.7401 3.64653 11.6462L10.7934 4.5H5.50028C5.36767 4.5 5.24049 4.44732 5.14672 4.35355C5.05296 4.25979 5.00028 4.13261 5.00028 4C5.00028 3.86739 5.05296 3.74021 5.14672 3.64645C5.24049 3.55268 5.36767 3.5 5.50028 3.5H12.0003C12.1329 3.5 12.2601 3.55268 12.3538 3.64645C12.4476 3.74021 12.5003 3.86739 12.5003 4Z"
      fill="currentColor"
    />
  </svg>
);

const TeamPitchDetailPage = () => {
  const router = useRouter();
  const { pitchUid } = router.query;
  const uid = typeof pitchUid === 'string' ? pitchUid : '';
  const [authToken] = useCookie('plnadmin');
  const { canViewTeamPitches, canMutateTeamPitches, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'investors' | 'founders'>('investors');
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<(PendingParticipantFields & { type: string }) | null>(
    null
  );
  const [pendingAccessChange, setPendingAccessChange] = useState<
    (PendingParticipantFields & { access: string }) | null
  >(null);
  const [pendingInvite, setPendingInvite] = useState<(PendingParticipantFields & { isResend: boolean }) | null>(null);
  const [pendingFollowUp, setPendingFollowUp] = useState<(PendingParticipantFields & { isResend: boolean }) | null>(
    null
  );
  const [pendingRemove, setPendingRemove] = useState<PendingParticipantFields | null>(null);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [bulkInviteMode, setBulkInviteMode] = useState<'all' | 'selected' | null>(null);
  const [bulkFollowUpMode, setBulkFollowUpMode] = useState<'all' | 'selected' | null>(null);
  const [pendingSelectedRemove, setPendingSelectedRemove] = useState(false);
  const [includeAlreadyInvited, setIncludeAlreadyInvited] = useState(false);
  const [includeAlreadyFollowedUp, setIncludeAlreadyFollowedUp] = useState(false);
  const [editingTemplateVars, setEditingTemplateVars] = useState<{
    uid: string;
    name?: string;
    email?: string;
    emailTemplateVariables?: Record<string, string> | null;
  } | null>(null);

  const typeMap = { investors: 'INVESTOR', founders: 'FOUNDER' } as const;

  const { data: pitch, isLoading: pitchLoading, refetch: refetchPitch } = useTeamPitchDetail(authToken, uid);
  const {
    data: participantsRaw,
    isLoading: participantsLoading,
    refetch: refetchParticipants,
  } = useTeamPitchParticipants(authToken, uid, typeMap[activeTab]);

  const updatePitch = useUpdateTeamPitch();
  const updateParticipant = useUpdateTeamPitchParticipant();
  const sendInvite = useSendTeamPitchInvite();
  const sendInvitesBulk = useSendTeamPitchInvitesBulk();
  const sendFollowUp = useSendTeamPitchFollowUp();
  const sendFollowUpsBulk = useSendTeamPitchFollowUpsBulk();
  const removeParticipant = useRemoveTeamPitchParticipant();
  const removeParticipantsBulk = useRemoveTeamPitchParticipantsBulk();

  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    spotlightFrequency: 'month',
    spotlightStatement: '',
    slug: '',
    status: 'DRAFT',
    supportEmail: '',
    senderEmail: '',
    senderName: '',
    replyToEmail: '',
    analyticsReportUrl: '',
  });

  useEffect(() => {
    if (!authToken) router.replace(`/?backlink=${router.asPath}`);
  }, [authToken, router]);

  useEffect(() => {
    if (!authLoading && !canViewTeamPitches) router.replace('/');
  }, [canViewTeamPitches, authLoading, router]);

  useEffect(() => {
    if (pitch) {
      setEditFormData({
        title: pitch.title,
        description: pitch.description,
        spotlightFrequency: pitch.spotlightFrequency ?? 'month',
        spotlightStatement: pitch.spotlightStatement ?? '',
        slug: pitch.slug,
        status: pitch.status,
        supportEmail: pitch.supportEmail,
        senderEmail: pitch.senderEmail ?? '',
        senderName: pitch.senderName ?? '',
        replyToEmail: pitch.replyToEmail ?? '',
        analyticsReportUrl: pitch.analyticsReportUrl ?? '',
      });
    }
  }, [pitch]);

  useEffect(() => {
    setSelectedUids([]);
  }, [activeTab]);

  const participants = useMemo(() => {
    const list = participantsRaw ?? [];
    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((p: { member?: { name?: string; email?: string } }) => {
      const name = p.member?.name?.toLowerCase() ?? '';
      const email = p.member?.email?.toLowerCase() ?? '';
      return name.includes(q) || email.includes(q);
    });
  }, [participantsRaw, searchTerm]);

  const selectedUidSet = useMemo(() => new Set(selectedUids), [selectedUids]);
  const visibleUids = useMemo(() => participants.map((p: { uid: string }) => p.uid), [participants]);
  const allVisibleSelected =
    visibleUids.length > 0 && visibleUids.every((participantUid: string) => selectedUidSet.has(participantUid));
  const someVisibleSelected = visibleUids.some((participantUid: string) => selectedUidSet.has(participantUid));

  const selectedParticipants = useMemo(
    () => participants.filter((p: { uid: string }) => selectedUidSet.has(p.uid)),
    [participants, selectedUidSet]
  );

  const bulkInviteStats = useMemo(() => {
    const list = (participantsRaw ?? []) as Array<{
      access?: string;
      inviteSentCount?: number;
      member?: { email?: string | null };
    }>;
    const noAccess = list.filter((p) => p.access === 'RESTRICTED').length;
    const eligible = list.filter((p) => p.access !== 'RESTRICTED' && !!p.member?.email);
    const neverInvited = eligible.filter((p) => (p.inviteSentCount ?? 0) === 0);
    const alreadyInvited = eligible.filter((p) => (p.inviteSentCount ?? 0) > 0);
    return {
      eligible: eligible.length,
      neverInvited: neverInvited.length,
      alreadyInvited: alreadyInvited.length,
      noAccess,
    };
  }, [participantsRaw]);

  const selectedInviteStats = useMemo(() => {
    const list = selectedParticipants as Array<{
      access?: string;
      inviteSentCount?: number;
      member?: { email?: string | null };
    }>;
    const noAccess = list.filter((p) => p.access === 'RESTRICTED').length;
    const eligible = list.filter((p) => p.access !== 'RESTRICTED' && !!p.member?.email);
    const neverInvited = eligible.filter((p) => (p.inviteSentCount ?? 0) === 0);
    const alreadyInvited = eligible.filter((p) => (p.inviteSentCount ?? 0) > 0);
    return {
      eligible: eligible.length,
      neverInvited: neverInvited.length,
      alreadyInvited: alreadyInvited.length,
      noAccess,
    };
  }, [selectedParticipants]);

  const activeInviteStats = bulkInviteMode === 'selected' ? selectedInviteStats : bulkInviteStats;
  const bulkInviteTargetCount = includeAlreadyInvited ? activeInviteStats.eligible : activeInviteStats.neverInvited;

  const bulkFollowUpStats = useMemo(() => {
    const list = (participantsRaw ?? []) as Array<{
      access?: string;
      followUpSentCount?: number;
      member?: { email?: string | null };
    }>;
    const noAccess = list.filter((p) => p.access === 'RESTRICTED').length;
    const eligible = list.filter((p) => p.access !== 'RESTRICTED' && !!p.member?.email);
    const neverFollowedUp = eligible.filter((p) => (p.followUpSentCount ?? 0) === 0);
    const alreadyFollowedUp = eligible.filter((p) => (p.followUpSentCount ?? 0) > 0);
    return {
      eligible: eligible.length,
      neverFollowedUp: neverFollowedUp.length,
      alreadyFollowedUp: alreadyFollowedUp.length,
      noAccess,
    };
  }, [participantsRaw]);

  const selectedFollowUpStats = useMemo(() => {
    const list = selectedParticipants as Array<{
      access?: string;
      followUpSentCount?: number;
      member?: { email?: string | null };
    }>;
    const noAccess = list.filter((p) => p.access === 'RESTRICTED').length;
    const eligible = list.filter((p) => p.access !== 'RESTRICTED' && !!p.member?.email);
    const neverFollowedUp = eligible.filter((p) => (p.followUpSentCount ?? 0) === 0);
    const alreadyFollowedUp = eligible.filter((p) => (p.followUpSentCount ?? 0) > 0);
    return {
      eligible: eligible.length,
      neverFollowedUp: neverFollowedUp.length,
      alreadyFollowedUp: alreadyFollowedUp.length,
      noAccess,
    };
  }, [selectedParticipants]);

  const activeFollowUpStats = bulkFollowUpMode === 'selected' ? selectedFollowUpStats : bulkFollowUpStats;
  const bulkFollowUpTargetCount = includeAlreadyFollowedUp
    ? activeFollowUpStats.eligible
    : activeFollowUpStats.neverFollowedUp;

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedUids((prev) => prev.filter((id) => !visibleUids.includes(id)));
      return;
    }
    setSelectedUids((prev) => [...new Set([...prev, ...visibleUids])]);
  };

  const toggleSelectUid = (participantUid: string) => {
    setSelectedUids((prev) =>
      prev.includes(participantUid) ? prev.filter((id) => id !== participantUid) : [...prev, participantUid]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'text-green-600 bg-green-100';
      case 'CLOSED':
        return 'text-red-600 bg-red-100';
      case 'DRAFT':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSavePitch = async () => {
    if (!authToken) return;
    try {
      await updatePitch.mutateAsync({
        authToken,
        pitchUid: uid,
        data: {
          ...editFormData,
          supportEmail: editFormData.supportEmail.trim() || null,
          senderEmail: editFormData.senderEmail.trim() || null,
          senderName: editFormData.senderName.trim() || null,
          replyToEmail: editFormData.replyToEmail.trim() || null,
          spotlightStatement: editFormData.spotlightStatement.trim() || null,
          analyticsReportUrl: editFormData.analyticsReportUrl.trim() || null,
        },
      });
      toast.success('Team spotlight updated');
      setIsEditing(false);
      refetchPitch();
    } catch {
      toast.error('Failed to update team spotlight');
    }
  };

  if (!authToken || authLoading) {
    return null;
  }

  if (pitchLoading) {
    return (
      <ApprovalLayout>
        <div className={clsx(s.root, s.wide)}>
          <div className={s.loadingState}>Loading team spotlight details...</div>
        </div>
      </ApprovalLayout>
    );
  }

  if (!pitch) {
    return (
      <ApprovalLayout>
        <div className={clsx(s.root, s.wide)}>
          <div className={s.emptyState}>
            <div>Team spotlight not found</div>
            <button onClick={() => router.push('/teams/team-pitches')} className={clsx(s.editButton, s.primary)}>
              Back to Team Spotlights
            </button>
          </div>
        </div>
      </ApprovalLayout>
    );
  }

  return (
    <ApprovalLayout>
      <div className={clsx(s.root, s.wide)}>
        <div className={s.backButton}>
          <button onClick={() => router.push('/teams/team-pitches')} className="mb-4 text-blue-600 hover:text-blue-800">
            ← Back to Team Spotlights
          </button>
        </div>

        <div className={s.header}>
          <div>
            <span className={s.title}>{pitch.title}</span>
            {pitch.team?.name && (
              <p className="mt-1 text-sm text-gray-500">
                Team:{' '}
                <a
                  href={`${WEB_UI_BASE_URL}/teams/${pitch.team.uid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  {pitch.team.name}
                </a>
              </p>
            )}
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor(pitch.status)}`}>
            {pitch.status}
          </span>
        </div>

        <div className={s.body}>
          <div className={s.overview}>
            <div className={s.overviewHeader}>
              <h2 className={s.overviewTitle}>Overview</h2>
              {canMutateTeamPitches &&
                (!isEditing ? (
                  <button onClick={() => setIsEditing(true)} className={s.editButton}>
                    Edit
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditFormData({
                          title: pitch.title,
                          description: pitch.description,
                          spotlightFrequency: pitch.spotlightFrequency ?? 'month',
                          spotlightStatement: pitch.spotlightStatement ?? '',
                          slug: pitch.slug,
                          status: pitch.status,
                          supportEmail: pitch.supportEmail,
                          senderEmail: pitch.senderEmail ?? '',
                          senderName: pitch.senderName ?? '',
                          replyToEmail: pitch.replyToEmail ?? '',
                          analyticsReportUrl: pitch.analyticsReportUrl ?? '',
                        });
                      }}
                      className={s.editButton}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSavePitch}
                      disabled={updatePitch.isPending}
                      className={clsx(s.editButton, s.primary)}
                    >
                      {updatePitch.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                ))}
            </div>

            <div className={s.overviewGrid}>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Title</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.title}
                    onChange={(e) => handleEditFormChange('title', e.target.value)}
                    className={s.fieldInput}
                  />
                ) : (
                  <div className={s.fieldValue}>{pitch.title}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>URL Slug</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.slug}
                    onChange={(e) => handleEditFormChange('slug', e.target.value)}
                    className={s.fieldInput}
                  />
                ) : (
                  <div className={s.fieldValue}>{pitch.slug}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Status</label>
                {isEditing ? (
                  <select
                    value={editFormData.status}
                    onChange={(e) => handleEditFormChange('status', e.target.value)}
                    className={s.fieldInput}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="OPEN">Open</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                ) : (
                  <div className={s.fieldValue}>{pitch.status}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Support Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editFormData.supportEmail}
                    onChange={(e) => handleEditFormChange('supportEmail', e.target.value)}
                    className={s.fieldInput}
                    placeholder="Leave blank to use default support email"
                  />
                ) : (
                  <div className={s.fieldValue}>{pitch.supportEmail}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Sender Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editFormData.senderEmail}
                    onChange={(e) => handleEditFormChange('senderEmail', e.target.value)}
                    className={s.fieldInput}
                    placeholder="Leave blank to use system default"
                  />
                ) : (
                  <div className={s.fieldValue}>{pitch.senderEmail || 'System default'}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Sender Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.senderName}
                    onChange={(e) => handleEditFormChange('senderName', e.target.value)}
                    className={s.fieldInput}
                    placeholder="e.g. Remi Antczak"
                  />
                ) : (
                  <div className={s.fieldValue}>{pitch.senderName || '—'}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Reply-To Email</label>
                {isEditing ? (
                  <input
                    type="email"
                    value={editFormData.replyToEmail}
                    onChange={(e) => handleEditFormChange('replyToEmail', e.target.value)}
                    className={s.fieldInput}
                    placeholder="Optional reply-to address"
                  />
                ) : (
                  <div className={s.fieldValue}>{pitch.replyToEmail || '—'}</div>
                )}
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Analytics Report URL</label>
                {isEditing ? (
                  <input
                    type="url"
                    value={editFormData.analyticsReportUrl}
                    onChange={(e) => handleEditFormChange('analyticsReportUrl', e.target.value)}
                    className={s.fieldInput}
                    placeholder="https://..."
                  />
                ) : pitch.analyticsReportUrl ? (
                  <div className={s.fieldValue}>
                    <a
                      href={pitch.analyticsReportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-blue-600 hover:underline"
                    >
                      {pitch.analyticsReportUrl}
                      <TeamExternalLinkIcon />
                    </a>
                  </div>
                ) : (
                  <div className={s.fieldValue}>—</div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Visible as &quot;Spotlight Stats&quot; on the team card for founders and pitch admins only.
                </p>
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Spotlight Statement</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.spotlightStatement}
                    onChange={(e) => handleEditFormChange('spotlightStatement', e.target.value)}
                    className={s.fieldInput}
                    placeholder="One-line statement shown after the team name (optional)"
                  />
                ) : (
                  <div className={s.fieldValue}>{pitch.spotlightStatement || '—'}</div>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Investor hero line: This Spotlight: {pitch.team?.name ?? 'Team'} — statement. Leave blank to show only
                  the linked team name.
                </p>
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Description</label>
                {isEditing ? (
                  <RichTextEditor
                    id="pitch-description"
                    value={editFormData.description}
                    onChange={(value) => handleEditFormChange('description', value)}
                  />
                ) : (
                  <div className={s.fieldValue}>
                    <RichText text={pitch.description ?? ''} />
                  </div>
                )}
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Spotlight Page URL</label>
                <div className={s.fieldValue}>
                  <a
                    href={pitch.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-blue-600 hover:text-blue-800"
                  >
                    {pitch.publicUrl}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className={s.participants}>
            <div className={s.participantsHeader}>
              <div className={s.participantsHeaderTop}>
                <h2 className={s.participantsTitle}>Participants</h2>
                <div className={s.participantsActions}>
                  {canMutateTeamPitches && (
                    <button onClick={() => setShowAddParticipantModal(true)} className={clsx(s.editButton, s.primary)}>
                      Add Participant
                    </button>
                  )}
                  {canMutateTeamPitches && activeTab === 'investors' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIncludeAlreadyInvited(false);
                          setBulkInviteMode('all');
                        }}
                        disabled={!bulkInviteStats.eligible}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        Send Invites to All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIncludeAlreadyFollowedUp(false);
                          setBulkFollowUpMode('all');
                        }}
                        disabled={!bulkFollowUpStats.eligible}
                        className="rounded-lg bg-violet-600 px-4 py-2 text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        Send Follow-ups to All
                      </button>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                      >
                        Upload Investors CSV
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className={s.tabs}>
                {(['investors', 'founders'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={clsx(s.tab, { [s.active]: activeTab === tab })}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {activeTab === tab && participantsRaw && ` (${participantsRaw.length})`}
                  </button>
                ))}
              </div>

              <div className={s.participantsFilters}>
                <input
                  type="text"
                  placeholder="Search by name or email"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={clsx(s.input)}
                />
              </div>

              {canMutateTeamPitches && selectedUids.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <span className="text-sm font-medium text-indigo-900">{selectedUids.length} selected</span>
                  <button
                    type="button"
                    className="text-sm text-indigo-700 underline hover:text-indigo-900"
                    onClick={() => setSelectedUids([])}
                  >
                    Clear
                  </button>
                  {activeTab === 'investors' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIncludeAlreadyInvited(true);
                          setBulkInviteMode('selected');
                        }}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                      >
                        Send Invite to Selected
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIncludeAlreadyFollowedUp(true);
                          setBulkFollowUpMode('selected');
                        }}
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700"
                      >
                        Send Follow-up to Selected
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingSelectedRemove(true)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                  >
                    Remove Selected
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={s.participantsTable}>
            {participantsLoading ? (
              <div className={s.loadingState}>Loading participants...</div>
            ) : participants.length === 0 ? (
              <div className={s.emptyState}>No participants found</div>
            ) : (
              <div className={s.table}>
                <div className={clsx(s.tableRow, s.tableHeader)}>
                  {canMutateTeamPitches && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 48 }}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                        }}
                        onChange={toggleSelectAllVisible}
                        aria-label="Select all visible participants"
                      />
                    </div>
                  )}
                  <div className={clsx(s.headerCell, s.first, s.flexible)}>Member</div>
                  {(activeTab === 'investors' || activeTab === 'founders') && (
                    <div className={clsx(s.headerCell, s.flexible)}>Team</div>
                  )}
                  {activeTab === 'investors' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 120 }}>
                      Investor Type
                    </div>
                  )}
                  {activeTab === 'investors' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 90 }}>
                      Invite Accepted
                    </div>
                  )}
                  {activeTab === 'investors' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 140 }}>
                      Follow-up
                    </div>
                  )}
                  {activeTab === 'investors' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 180 }}>
                      Template vars
                    </div>
                  )}
                  <div className={clsx(s.headerCell, s.fixed)} style={{ width: 150 }}>
                    Type
                  </div>
                  <div className={clsx(s.headerCell, s.fixed)} style={{ width: 220 }}>
                    Access
                  </div>
                  <div className={clsx(s.headerCell, s.fixed)} style={{ width: activeTab === 'investors' ? 110 : 60 }}>
                    Actions
                  </div>
                </div>

                {participants.map((participant: any) => {
                  const investorTeam =
                    participant.member?.teamMemberRoles?.find((role: { mainTeam: boolean }) => role.mainTeam)?.team ||
                    participant.member?.teamMemberRoles?.[0]?.team;
                  const founderTeam = participant.team || pitch.team;
                  const profileType = participant.member?.investorProfile?.type;
                  const investorTypeConfig = profileType ? INVESTOR_TYPE_CONFIG[profileType] : null;
                  const inviteAccepted =
                    participant.member?.memberState !== 'PENDING' && !!participant.member?.externalId;

                  return (
                    <div key={participant.uid} className={s.tableRow}>
                      {canMutateTeamPitches && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 48 }}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={selectedUidSet.has(participant.uid)}
                            onChange={() => toggleSelectUid(participant.uid)}
                            aria-label={`Select ${
                              participant.member?.name || participant.member?.email || 'participant'
                            }`}
                          />
                        </div>
                      )}
                      <div className={clsx(s.bodyCell, s.first, s.flexible)}>
                        <div className="flex items-center">
                          {participant.member?.profilePicture && (
                            <Image
                              className="mr-3 h-8 w-8 flex-shrink-0 rounded-full object-cover"
                              src={participant.member.profilePicture}
                              alt=""
                              width={32}
                              height={32}
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{participant.member?.name}</div>
                            <div className="text-sm text-gray-500">{participant.member?.email}</div>
                          </div>
                        </div>
                      </div>

                      {(activeTab === 'investors' || activeTab === 'founders') && (
                        <div className={clsx(s.bodyCell, s.flexible)}>
                          {activeTab === 'investors' ? (
                            investorTeam ? (
                              <a
                                href={`${WEB_UI_BASE_URL}/teams/${investorTeam.uid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                              >
                                {investorTeam.name}
                                <TeamExternalLinkIcon />
                              </a>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )
                          ) : founderTeam ? (
                            <a
                              href={`${WEB_UI_BASE_URL}/teams/${founderTeam.uid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                            >
                              {founderTeam.name}
                              <TeamExternalLinkIcon />
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      )}

                      {activeTab === 'investors' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 120 }}>
                          {investorTypeConfig ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${investorTypeConfig.bgColor} ${investorTypeConfig.textColor}`}
                            >
                              {investorTypeConfig.label}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                              not provided
                            </span>
                          )}
                        </div>
                      )}

                      {activeTab === 'investors' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 90 }}>
                          {inviteAccepted ? (
                            <svg
                              className="mx-auto h-5 w-5 text-green-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg
                              className="mx-auto h-5 w-5 text-red-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                        </div>
                      )}

                      {activeTab === 'investors' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 140 }}>
                          {(participant.followUpSentCount ?? 0) > 0 ? (
                            <div className="text-sm text-gray-700">
                              <div>{participant.followUpSentCount} sent</div>
                              {formatFollowUpDate(participant.followUpSentAt) && (
                                <div className="text-xs text-gray-500">
                                  {formatFollowUpDate(participant.followUpSentAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </div>
                      )}

                      {activeTab === 'investors' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 180 }}>
                          {(() => {
                            const preview = formatTemplateVariablesPreview(participant.emailTemplateVariables);
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingTemplateVars({
                                    uid: participant.uid,
                                    name: participant.member?.name,
                                    email: participant.member?.email,
                                    emailTemplateVariables: participant.emailTemplateVariables,
                                  })
                                }
                                className={
                                  preview
                                    ? 'block w-full truncate text-left text-sm text-blue-600 hover:text-blue-800'
                                    : 'text-sm text-gray-400 hover:text-blue-600'
                                }
                                title={preview ?? undefined}
                              >
                                {preview ?? 'no data'}
                              </button>
                            );
                          })()}
                        </div>
                      )}

                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 150 }}>
                        <select
                          value={participant.type}
                          disabled={!canMutateTeamPitches || updateParticipant.isPending}
                          onChange={(e) =>
                            setPendingTypeChange({
                              uid: participant.uid,
                              type: e.target.value,
                              name: participant.member?.name,
                              email: participant.member?.email,
                            })
                          }
                          className={clsx(
                            'inline-flex rounded-full border-0 px-2 py-1 text-xs font-semibold disabled:opacity-50',
                            getParticipantTypeSelectClass(participant.type)
                          )}
                        >
                          <option value="INVESTOR">Investor</option>
                          <option value="FOUNDER">Founder</option>
                        </select>
                      </div>

                      <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 220 }}>
                        <select
                          value={participant.access}
                          disabled={!canMutateTeamPitches || updateParticipant.isPending}
                          onChange={(e) =>
                            setPendingAccessChange({
                              uid: participant.uid,
                              access: e.target.value,
                              name: participant.member?.name,
                              email: participant.member?.email,
                            })
                          }
                          className={clsx(
                            'inline-flex rounded-full border-0 px-2 py-1 text-xs font-semibold disabled:opacity-50',
                            getAccessSelectClass(participant.access)
                          )}
                        >
                          {ACCESS_OPTIONS.map((a) => (
                            <option key={a} value={a}>
                              {ACCESS_LABELS[a]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div
                        className={clsx(s.bodyCell, s.fixed)}
                        style={{ width: activeTab === 'investors' ? 110 : 60 }}
                      >
                        {canMutateTeamPitches && (
                          <div className="flex items-center gap-1">
                            {activeTab === 'investors' &&
                              (participant.access === 'RESTRICTED' ? (
                                <span className="text-sm text-gray-400">No Access</span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="rounded p-1 text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                                    aria-label={participant.inviteSentCount > 0 ? 'Resend Invite' : 'Send Invite'}
                                    title={participant.inviteSentCount > 0 ? 'Resend Invite' : 'Send Invite'}
                                    onClick={() =>
                                      setPendingInvite({
                                        uid: participant.uid,
                                        name: participant.member?.name,
                                        email: participant.member?.email,
                                        isResend: participant.inviteSentCount > 0,
                                      })
                                    }
                                  >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded p-1 text-violet-600 hover:bg-violet-50 hover:text-violet-800"
                                    aria-label={
                                      (participant.followUpSentCount ?? 0) > 0 ? 'Resend Follow-up' : 'Send Follow-up'
                                    }
                                    title={
                                      (participant.followUpSentCount ?? 0) > 0 ? 'Resend Follow-up' : 'Send Follow-up'
                                    }
                                    onClick={() =>
                                      setPendingFollowUp({
                                        uid: participant.uid,
                                        name: participant.member?.name,
                                        email: participant.member?.email,
                                        isResend: (participant.followUpSentCount ?? 0) > 0,
                                      })
                                    }
                                  >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                      />
                                    </svg>
                                  </button>
                                </>
                              ))}
                            <button
                              type="button"
                              className="rounded p-1 text-red-600 hover:bg-red-50 hover:text-red-800"
                              aria-label="Remove participant"
                              title="Remove participant"
                              onClick={() =>
                                setPendingRemove({
                                  uid: participant.uid,
                                  name: participant.member?.name,
                                  email: participant.member?.email,
                                })
                              }
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <AddTeamPitchParticipantModal
          isOpen={showAddParticipantModal}
          onClose={() => setShowAddParticipantModal(false)}
          pitchUid={uid}
          defaultType={typeMap[activeTab]}
          onAdded={() => refetchParticipants()}
        />

        <UploadTeamPitchInvestorsModal
          isOpen={showUploadModal}
          onClose={() => {
            setShowUploadModal(false);
            refetchParticipants();
          }}
          pitchUid={uid}
        />

        <EditEmailTemplateVariablesModal
          isOpen={!!editingTemplateVars}
          onClose={() => setEditingTemplateVars(null)}
          pitchUid={uid}
          participantUid={editingTemplateVars?.uid ?? ''}
          participantName={editingTemplateVars?.name}
          participantEmail={editingTemplateVars?.email}
          emailTemplateVariables={editingTemplateVars?.emailTemplateVariables}
          canEdit={canMutateTeamPitches}
        />

        <TeamPitchConfirmModal
          isOpen={!!pendingTypeChange}
          title="Change participant type"
          message={
            pendingTypeChange
              ? `Change this participant's type to ${formatParticipantTypeLabel(pendingTypeChange.type)}?`
              : ''
          }
          participantName={pendingTypeChange?.name}
          participantEmail={pendingTypeChange?.email}
          isPending={updateParticipant.isPending}
          onClose={() => setPendingTypeChange(null)}
          onConfirm={async () => {
            if (!authToken || !pendingTypeChange) return;
            try {
              await updateParticipant.mutateAsync({
                authToken,
                pitchUid: uid,
                participantUid: pendingTypeChange.uid,
                data: { type: pendingTypeChange.type },
              });
              toast.success('Participant updated');
              setPendingTypeChange(null);
              refetchParticipants();
            } catch {
              toast.error('Failed to update participant');
            }
          }}
        />

        <TeamPitchConfirmModal
          isOpen={!!pendingAccessChange}
          title="Change participant access"
          message={
            pendingAccessChange
              ? `Change this participant's access to ${formatAccessLabel(pendingAccessChange.access)}?`
              : ''
          }
          participantName={pendingAccessChange?.name}
          participantEmail={pendingAccessChange?.email}
          isPending={updateParticipant.isPending}
          onClose={() => setPendingAccessChange(null)}
          onConfirm={async () => {
            if (!authToken || !pendingAccessChange) return;
            try {
              await updateParticipant.mutateAsync({
                authToken,
                pitchUid: uid,
                participantUid: pendingAccessChange.uid,
                data: { access: pendingAccessChange.access },
              });
              toast.success('Participant updated');
              setPendingAccessChange(null);
              refetchParticipants();
            } catch {
              toast.error('Failed to update participant');
            }
          }}
        />

        <TeamPitchConfirmModal
          isOpen={!!pendingInvite}
          title={pendingInvite?.isResend ? 'Resend investor invite' : 'Send investor invite'}
          message={
            pendingInvite?.isResend
              ? 'Resend the team spotlight investor invitation email to this participant?'
              : 'Send the team spotlight investor invitation email to this participant?'
          }
          participantName={pendingInvite?.name}
          participantEmail={pendingInvite?.email}
          confirmLabel={pendingInvite?.isResend ? 'Resend' : 'Send'}
          isPending={sendInvite.isPending}
          onClose={() => setPendingInvite(null)}
          details={
            pitch ? (
              <div className="space-y-2 text-sm text-gray-600">
                <p className="font-medium text-gray-700">Email that will be sent:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <span className="font-medium">Team spotlight investor invite</span> — a branded invitation to view{' '}
                    <span className="font-medium">{pitch.title}</span>
                  </li>
                  <li>A link to the spotlight page on the directory, with their email pre-filled for sign-in</li>
                  <li>
                    Context for <span className="font-medium">{pitch.team?.name ?? 'the team'}</span> and support
                    contact ({pitch.supportEmail})
                  </li>
                  <li>Delivered to their inbox via email (not in-app notification)</li>
                </ul>
                {pendingInvite?.isResend && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                    This investor has been invited before; they will receive a new copy of the same invite email.
                  </p>
                )}
              </div>
            ) : null
          }
          onConfirm={async () => {
            if (!authToken || !pendingInvite) return;
            try {
              await sendInvite.mutateAsync({
                authToken,
                pitchUid: uid,
                participantUid: pendingInvite.uid,
              });
              toast.success(pendingInvite.isResend ? 'Invite resent' : 'Invite sent');
              setPendingInvite(null);
              refetchParticipants();
            } catch {
              toast.error('Failed to send invite');
            }
          }}
        />

        <TeamPitchConfirmModal
          isOpen={!!pendingFollowUp}
          title={pendingFollowUp?.isResend ? 'Resend investor follow-up' : 'Send investor follow-up'}
          message={
            pendingFollowUp?.isResend
              ? 'Resend the team spotlight investor follow-up email to this participant?'
              : 'Send the team spotlight investor follow-up email to this participant?'
          }
          participantName={pendingFollowUp?.name}
          participantEmail={pendingFollowUp?.email}
          confirmLabel={pendingFollowUp?.isResend ? 'Resend' : 'Send'}
          isPending={sendFollowUp.isPending}
          onClose={() => setPendingFollowUp(null)}
          details={
            pitch ? (
              <div className="space-y-2 text-sm text-gray-600">
                <p className="font-medium text-gray-700">Email that will be sent:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <span className="font-medium">Team spotlight investor follow-up</span> — a reminder to review{' '}
                    <span className="font-medium">{pitch.title}</span>
                  </li>
                  <li>A link to the spotlight page on the directory, with their email pre-filled for sign-in</li>
                  <li>
                    Context for <span className="font-medium">{pitch.team?.name ?? 'the team'}</span> and support
                    contact ({pitch.supportEmail})
                  </li>
                  <li>Delivered to their inbox via email (not in-app notification)</li>
                </ul>
                {pendingFollowUp?.isResend && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                    This investor has received a follow-up before; they will receive a new copy of the follow-up email.
                  </p>
                )}
              </div>
            ) : null
          }
          onConfirm={async () => {
            if (!authToken || !pendingFollowUp) return;
            try {
              await sendFollowUp.mutateAsync({
                authToken,
                pitchUid: uid,
                participantUid: pendingFollowUp.uid,
              });
              toast.success(pendingFollowUp.isResend ? 'Follow-up resent' : 'Follow-up sent');
              setPendingFollowUp(null);
              refetchParticipants();
            } catch {
              toast.error('Failed to send follow-up');
            }
          }}
        />

        <TeamPitchConfirmModal
          isOpen={!!pendingRemove}
          title="Remove participant"
          message="Remove this participant from the team spotlight? They will lose access. Their member profile will not be deleted."
          participantName={pendingRemove?.name}
          participantEmail={pendingRemove?.email}
          confirmLabel="Remove"
          isPending={removeParticipant.isPending}
          onClose={() => setPendingRemove(null)}
          onConfirm={async () => {
            if (!authToken || !pendingRemove) return;
            try {
              await removeParticipant.mutateAsync({
                authToken,
                pitchUid: uid,
                participantUid: pendingRemove.uid,
              });
              toast.success('Participant removed');
              setPendingRemove(null);
              refetchParticipants();
            } catch {
              toast.error('Failed to remove participant');
            }
          }}
        />

        <TeamPitchConfirmModal
          isOpen={bulkInviteMode !== null}
          title={bulkInviteMode === 'selected' ? 'Send invites to selected investors' : 'Send invites to all investors'}
          message={
            includeAlreadyInvited
              ? `Send the team spotlight invite email to ${activeInviteStats.eligible} eligible investor${
                  activeInviteStats.eligible === 1 ? '' : 's'
                }${bulkInviteMode === 'selected' ? ' from your selection' : ''}?`
              : activeInviteStats.neverInvited > 0
              ? `Send the team spotlight invite email to ${activeInviteStats.neverInvited} investor${
                  activeInviteStats.neverInvited === 1 ? '' : 's'
                } who have not been invited yet?`
              : 'Every eligible investor in this set has already been invited. Enable the option below to resend.'
          }
          confirmLabel={`Send ${bulkInviteTargetCount} invite${bulkInviteTargetCount === 1 ? '' : 's'}`}
          confirmDisabled={bulkInviteTargetCount === 0}
          isPending={sendInvitesBulk.isPending}
          onClose={() => {
            if (sendInvitesBulk.isPending) return;
            setBulkInviteMode(null);
            setIncludeAlreadyInvited(false);
          }}
          details={
            <div className="space-y-3 text-sm text-gray-600">
              {bulkInviteMode === 'selected' && (
                <p>
                  Selected: <span className="font-medium text-gray-900">{selectedUids.length}</span>
                </p>
              )}
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Eligible investors: <span className="font-medium text-gray-900">{activeInviteStats.eligible}</span>
                </li>
                <li>
                  Not yet invited: <span className="font-medium text-gray-900">{activeInviteStats.neverInvited}</span>
                </li>
                <li>
                  Already invited: <span className="font-medium text-gray-900">{activeInviteStats.alreadyInvited}</span>
                </li>
                {activeInviteStats.noAccess > 0 && (
                  <li>
                    Skipped (No Access): <span className="font-medium text-gray-900">{activeInviteStats.noAccess}</span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-gray-500">
                Investors marked No Access are never emailed, even when resending.
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={includeAlreadyInvited}
                  disabled={sendInvitesBulk.isPending || activeInviteStats.alreadyInvited === 0}
                  onChange={(e) => setIncludeAlreadyInvited(e.target.checked)}
                />
                <span>
                  <span className="block font-medium text-gray-900">
                    Also resend to investors who already received an invite
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {bulkInviteMode === 'selected'
                      ? 'On by default for selected people — turn off to skip anyone already invited.'
                      : 'Off by default — only people who have never been invited will get an email. Turn this on only if you intentionally want to email everyone again.'}
                  </span>
                </span>
              </label>
              {includeAlreadyInvited && activeInviteStats.alreadyInvited > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                  {activeInviteStats.alreadyInvited} investor
                  {activeInviteStats.alreadyInvited === 1 ? '' : 's'} will receive another copy of the invite email.
                </p>
              )}
            </div>
          }
          onConfirm={async () => {
            if (!authToken || bulkInviteTargetCount === 0 || !bulkInviteMode) return;
            try {
              const result = await sendInvitesBulk.mutateAsync({
                authToken,
                pitchUid: uid,
                includeAlreadyInvited,
                ...(bulkInviteMode === 'selected' ? { participantUids: selectedUids } : {}),
              });
              const { sent, skipped, errors } = result.summary;
              if (errors > 0) {
                toast.warning(
                  `Sent ${sent} invite${sent === 1 ? '' : 's'}; ${errors} failed${
                    skipped > 0 ? `, ${skipped} skipped` : ''
                  }`
                );
              } else {
                toast.success(
                  `Sent ${sent} invite${sent === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} skipped)` : ''}`
                );
              }
              setBulkInviteMode(null);
              setIncludeAlreadyInvited(false);
              if (bulkInviteMode === 'selected') setSelectedUids([]);
              refetchParticipants();
            } catch {
              toast.error('Failed to send invites');
            }
          }}
        />

        <TeamPitchConfirmModal
          isOpen={bulkFollowUpMode !== null}
          title={
            bulkFollowUpMode === 'selected'
              ? 'Send follow-ups to selected investors'
              : 'Send follow-ups to all investors'
          }
          message={
            includeAlreadyFollowedUp
              ? `Send the team spotlight follow-up email to ${activeFollowUpStats.eligible} eligible investor${
                  activeFollowUpStats.eligible === 1 ? '' : 's'
                }${bulkFollowUpMode === 'selected' ? ' from your selection' : ''}?`
              : activeFollowUpStats.neverFollowedUp > 0
              ? `Send the team spotlight follow-up email to ${activeFollowUpStats.neverFollowedUp} investor${
                  activeFollowUpStats.neverFollowedUp === 1 ? '' : 's'
                } who have not received a follow-up yet?`
              : 'Every eligible investor in this set has already received a follow-up. Enable the option below to resend.'
          }
          confirmLabel={`Send ${bulkFollowUpTargetCount} follow-up${bulkFollowUpTargetCount === 1 ? '' : 's'}`}
          confirmDisabled={bulkFollowUpTargetCount === 0}
          isPending={sendFollowUpsBulk.isPending}
          onClose={() => {
            if (sendFollowUpsBulk.isPending) return;
            setBulkFollowUpMode(null);
            setIncludeAlreadyFollowedUp(false);
          }}
          details={
            <div className="space-y-3 text-sm text-gray-600">
              {bulkFollowUpMode === 'selected' && (
                <p>
                  Selected: <span className="font-medium text-gray-900">{selectedUids.length}</span>
                </p>
              )}
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Eligible investors: <span className="font-medium text-gray-900">{activeFollowUpStats.eligible}</span>
                </li>
                <li>
                  Not yet followed up:{' '}
                  <span className="font-medium text-gray-900">{activeFollowUpStats.neverFollowedUp}</span>
                </li>
                <li>
                  Already followed up:{' '}
                  <span className="font-medium text-gray-900">{activeFollowUpStats.alreadyFollowedUp}</span>
                </li>
                {activeFollowUpStats.noAccess > 0 && (
                  <li>
                    Skipped (No Access):{' '}
                    <span className="font-medium text-gray-900">{activeFollowUpStats.noAccess}</span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-gray-500">
                Investors marked No Access are never emailed, even when resending.
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  checked={includeAlreadyFollowedUp}
                  disabled={sendFollowUpsBulk.isPending || activeFollowUpStats.alreadyFollowedUp === 0}
                  onChange={(e) => setIncludeAlreadyFollowedUp(e.target.checked)}
                />
                <span>
                  <span className="block font-medium text-gray-900">
                    Also resend to investors who already received a follow-up
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    {bulkFollowUpMode === 'selected'
                      ? 'On by default for selected people — turn off to skip anyone already followed up.'
                      : 'Off by default — only people who have never received a follow-up will get an email. Turn this on only if you intentionally want to email everyone again.'}
                  </span>
                </span>
              </label>
              {includeAlreadyFollowedUp && activeFollowUpStats.alreadyFollowedUp > 0 && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                  {activeFollowUpStats.alreadyFollowedUp} investor
                  {activeFollowUpStats.alreadyFollowedUp === 1 ? '' : 's'} will receive another copy of the follow-up
                  email.
                </p>
              )}
            </div>
          }
          onConfirm={async () => {
            if (!authToken || bulkFollowUpTargetCount === 0 || !bulkFollowUpMode) return;
            try {
              const result = await sendFollowUpsBulk.mutateAsync({
                authToken,
                pitchUid: uid,
                includeAlreadyFollowedUp,
                ...(bulkFollowUpMode === 'selected' ? { participantUids: selectedUids } : {}),
              });
              const { sent, skipped, errors } = result.summary;
              if (errors > 0) {
                toast.warning(
                  `Sent ${sent} follow-up${sent === 1 ? '' : 's'}; ${errors} failed${
                    skipped > 0 ? `, ${skipped} skipped` : ''
                  }`
                );
              } else {
                toast.success(
                  `Sent ${sent} follow-up${sent === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} skipped)` : ''}`
                );
              }
              setBulkFollowUpMode(null);
              setIncludeAlreadyFollowedUp(false);
              if (bulkFollowUpMode === 'selected') setSelectedUids([]);
              refetchParticipants();
            } catch {
              toast.error('Failed to send follow-ups');
            }
          }}
        />

        <TeamPitchConfirmModal
          isOpen={pendingSelectedRemove}
          title="Remove selected participants"
          message={`Remove ${selectedUids.length} selected participant${
            selectedUids.length === 1 ? '' : 's'
          } from this team spotlight? They will lose access. Member profiles will not be deleted.`}
          confirmLabel={`Remove ${selectedUids.length}`}
          confirmDisabled={selectedUids.length === 0}
          isPending={removeParticipantsBulk.isPending}
          onClose={() => {
            if (removeParticipantsBulk.isPending) return;
            setPendingSelectedRemove(false);
          }}
          onConfirm={async () => {
            if (!authToken || selectedUids.length === 0) return;
            try {
              const result = await removeParticipantsBulk.mutateAsync({
                authToken,
                pitchUid: uid,
                participantUids: selectedUids,
              });
              toast.success(
                `Removed ${result.summary.removed} participant${result.summary.removed === 1 ? '' : 's'}${
                  result.summary.skipped > 0 ? ` (${result.summary.skipped} skipped)` : ''
                }`
              );
              setPendingSelectedRemove(false);
              setSelectedUids([]);
              refetchParticipants();
            } catch {
              toast.error('Failed to remove participants');
            }
          }}
        />
      </div>
    </ApprovalLayout>
  );
};

export default TeamPitchDetailPage;
