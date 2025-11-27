import React, { useState } from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import Image from 'next/image';
import { useDemoDayDetails } from '../../hooks/demo-days/useDemoDayDetails';
import { useDemoDayParticipants } from '../../hooks/demo-days/useDemoDayParticipants';
import { useUpdateDemoDay } from '../../hooks/demo-days/useUpdateDemoDay';
import { useUpdateParticipant } from '../../hooks/demo-days/useUpdateParticipant';
import { AddParticipantModal } from '../../components/demo-days/AddParticipantModal';
import { UploadParticipantsModal } from '../../components/demo-days/UploadParticipantsModal';
import { ApproveParticipantModal } from '../../components/demo-days/ApproveParticipantModal';
import { ApplicationDetailsModal } from '../../components/demo-days/ApplicationDetailsModal';
import { DemoDayParticipant, UpdateDemoDayDto } from '../../screens/demo-days/types/demo-day';
import { WEB_UI_BASE_URL } from '../../utils/constants';
import { RichText } from '../../components/common/rich-text';
import clsx from 'clsx';
import { toast } from 'react-toastify';
import dynamic from 'next/dynamic';

import s from './styles.module.scss';

const RichTextEditor = dynamic(() => import('../../components/common/rich-text-editor'), { ssr: false });

const DemoDayDetailPage = () => {
  const router = useRouter();
  const { slugURL } = router.query;
  const [authToken] = useCookie('plnadmin');
  const [activeTab, setActiveTab] = useState<'investors' | 'founders' | 'applications'>('applications');
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editFormData, setEditFormData] = useState<UpdateDemoDayDto>({});
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showApplicationDetailsModal, setShowApplicationDetailsModal] = useState(false);
  const [selectedParticipantForApproval, setSelectedParticipantForApproval] = useState<{
    uid: string;
    name: string;
    email: string;
  } | null>(null);
  const [selectedParticipantForDetails, setSelectedParticipantForDetails] = useState<DemoDayParticipant | null>(null);

  const updateDemoDayMutation = useUpdateDemoDay();
  const updateParticipantMutation = useUpdateParticipant();

  const { data: demoDay, isLoading: demoDayLoading } = useDemoDayDetails({
    authToken,
    slugURL: slugURL as string,
  });

  const { data: participants, isLoading: participantsLoading } = useDemoDayParticipants({
    authToken,
    demoDayUid: demoDay?.uid as string,
    query: {
      type: activeTab === 'applications' ? undefined : activeTab === 'investors' ? 'INVESTOR' : 'FOUNDER',
      search: searchTerm || undefined,
      status:
        activeTab === 'applications'
          ? 'PENDING'
          : (statusFilter as 'PENDING' | 'INVITED' | 'ENABLED' | 'DISABLED') || undefined,
      page: currentPage,
      limit: 50,
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  };

  // Convert ISO date string to datetime-local format in UTC
  const toDateTimeLocal = (isoString: string) => {
    if (!isoString) return '';
    // ISO string is already in UTC, just extract the date/time part
    return isoString.slice(0, 16);
  };

  // Convert datetime-local value to ISO string (treating input as UTC)
  const fromDateTimeLocal = (localValue: string) => {
    if (!localValue) return '';
    return `${localValue}:00.000Z`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-600 bg-green-100';
      case 'REGISTRATION_OPEN':
        return 'text-emerald-600 bg-emerald-100';
      case 'EARLY_ACCESS':
        return 'text-orange-600 bg-orange-100';
      case 'PENDING':
        return 'text-yellow-600 bg-yellow-100';
      case 'COMPLETED':
        return 'text-blue-600 bg-blue-100';
      case 'ARCHIVED':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getParticipantStatusColor = (status: string) => {
    switch (status) {
      case 'ENABLED':
        return 'text-green-600 bg-green-100';
      case 'INVITED':
        return 'text-blue-600 bg-blue-100';
      case 'PENDING':
        return 'text-yellow-600 bg-yellow-100';
      case 'DISABLED':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const handleEditDemoDay = () => {
    if (!demoDay) return;
    setEditFormData({
      title: demoDay.title,
      slugURL: demoDay.slugURL,
      description: demoDay.description,
      shortDescription: demoDay.shortDescription,
      startDate: demoDay.startDate,
      endDate: demoDay.endDate,
      approximateStartDate: demoDay.approximateStartDate,
      status: demoDay.status,
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditFormData({});
  };

  const handleSaveDemoDay = async () => {
    if (!authToken || !demoDay) return;

    try {
      await updateDemoDayMutation.mutateAsync({
        authToken,
        uid: demoDay.uid,
        data: editFormData,
      });
      setIsEditing(false);
      setEditFormData({});
    } catch (error) {
      console.error('Error updating demo day:', error);
      alert('Failed to update demo day. Please try again.');
    }
  };

  const handleUpdateParticipantStatus = async (
    participantUid: string,
    status: 'PENDING' | 'INVITED' | 'ENABLED' | 'DISABLED'
  ) => {
    if (!authToken || !demoDay) return;

    try {
      await updateParticipantMutation.mutateAsync({
        authToken,
        demoDayUid: demoDay.uid,
        participantUid,
        data: { status },
      });
    } catch (error) {
      console.error('Error updating participant status:', error);
      alert('Failed to update participant status. Please try again.');
    }
  };

  const handleUpdateParticipantType = async (
    participantUid: string,
    participantName: string,
    newType: 'INVESTOR' | 'FOUNDER'
  ) => {
    if (!authToken || !demoDay) return;

    const newTabName = newType === 'INVESTOR' ? 'Investors' : 'Founders';

    try {
      await updateParticipantMutation.mutateAsync({
        authToken,
        demoDayUid: demoDay.uid,
        participantUid,
        data: { type: newType },
      });
      toast.success(`Successfully moved ${participantName} to ${newTabName}`);
    } catch (error) {
      console.error('Error moving participant:', error);
      toast.error(`Failed to move ${participantName}. Please try again.`);
    }
  };

  const handleUpdateParticipantEarlyAccess = async (participantUid: string, hasEarlyAccess: boolean) => {
    if (!authToken || !demoDay) return;

    try {
      await updateParticipantMutation.mutateAsync({
        authToken,
        demoDayUid: demoDay.uid,
        participantUid,
        data: { hasEarlyAccess },
      });
    } catch (error) {
      console.error('Error updating early access:', error);
      toast.error('Failed to update early access. Please try again.');
    }
  };

  const handleUpdateParticipantTeam = async (
    participantUid: string,
    participantName: string,
    teamUid: string,
    teamName: string
  ) => {
    if (!authToken || !demoDay) return;

    try {
      await updateParticipantMutation.mutateAsync({
        authToken,
        demoDayUid: demoDay.uid,
        participantUid,
        data: { teamUid: teamUid || undefined },
      });
      toast.success(`Successfully updated team for ${participantName} to ${teamName}`);
    } catch (error) {
      console.error('Error updating team:', error);
      toast.error(`Failed to update team for ${participantName}. Please try again.`);
    }
  };

  const handleEditFormChange = (field: keyof UpdateDemoDayDto, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApproveClick = (participant: any) => {
    setSelectedParticipantForApproval({
      uid: participant.uid,
      name: participant.member?.name || participant.name,
      email: participant.member?.email || participant.email,
    });
    setShowApproveModal(true);
  };

  const handleApprove = async (participantUid: string, type: 'INVESTOR' | 'FOUNDER') => {
    if (!authToken || !demoDay) return;

    try {
      // Update both type and status to ENABLED
      await updateParticipantMutation.mutateAsync({
        authToken,
        demoDayUid: demoDay.uid,
        participantUid,
        data: {
          type,
          status: 'ENABLED',
        },
      });
      toast.success('Application approved successfully');
      setShowApproveModal(false);
      setSelectedParticipantForApproval(null);
    } catch (error) {
      console.error('Error approving participant:', error);
      toast.error('Failed to approve application. Please try again.');
    }
  };

  const handleReject = async (participantUid: string, participantName: string) => {
    if (!authToken || !demoDay) return;

    const confirmed = window.confirm(`Are you sure you want to reject ${participantName}'s application?`);

    if (!confirmed) return;

    try {
      await updateParticipantMutation.mutateAsync({
        authToken,
        demoDayUid: demoDay.uid,
        participantUid,
        data: { status: 'DISABLED' },
      });
      toast.success('Application rejected');
    } catch (error) {
      console.error('Error rejecting participant:', error);
      toast.error('Failed to reject application. Please try again.');
    }
  };

  const handleNextPage = () => {
    if (participants?.totalPages && currentPage < participants.totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, statusFilter]);

  if (demoDayLoading) {
    return (
      <ApprovalLayout>
        <div className={s.root}>
          <div className={s.loadingState}>Loading demo day details...</div>
        </div>
      </ApprovalLayout>
    );
  }

  if (!demoDay) {
    return (
      <ApprovalLayout>
        <div className={s.root}>
          <div className={s.emptyState}>
            <div>Demo day not found</div>
            <button onClick={() => router.push('/demo-days')} className={clsx(s.editButton, s.primary)}>
              Back to Demo Days
            </button>
          </div>
        </div>
      </ApprovalLayout>
    );
  }

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.backButton}>
          <button onClick={() => router.push('/demo-days')} className="mb-4 text-blue-600 hover:text-blue-800">
            ← Back to Demo Days
          </button>
        </div>
        <div className={s.header}>
          <div>
            <span className={s.title}>{demoDay.title}</span>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getStatusColor(demoDay.status)}`}
          >
            {demoDay.status}
          </span>
        </div>

        <div className={s.body}>
          {/* Overview Section */}
          <div className={s.overview}>
            <div className={s.overviewHeader}>
              <h2 className={s.overviewTitle}>Overview</h2>
              {!isEditing ? (
                <button onClick={handleEditDemoDay} className={s.editButton}>
                  Edit
                </button>
              ) : (
                <div className="flex space-x-2">
                  <button onClick={handleCancelEdit} className={s.editButton}>
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDemoDay}
                    disabled={updateDemoDayMutation.isPending}
                    className={clsx(s.editButton, s.primary)}
                  >
                    {updateDemoDayMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className={s.overviewGrid}>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Start Date (UTC)</label>
                {isEditing ? (
                  <input
                    type="datetime-local"
                    value={toDateTimeLocal(editFormData.startDate || '')}
                    onChange={(e) => handleEditFormChange('startDate', fromDateTimeLocal(e.target.value))}
                    className={s.fieldInput}
                  />
                ) : (
                  <div className={s.fieldValue}>{formatDate(demoDay.startDate)}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>End Date (UTC)</label>
                {isEditing ? (
                  <input
                    type="datetime-local"
                    value={toDateTimeLocal(editFormData.endDate || '')}
                    onChange={(e) => handleEditFormChange('endDate', fromDateTimeLocal(e.target.value))}
                    className={s.fieldInput}
                  />
                ) : (
                  <div className={s.fieldValue}>{formatDate(demoDay.endDate)}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Approximate Start Date</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.approximateStartDate || ''}
                    onChange={(e) => handleEditFormChange('approximateStartDate', e.target.value)}
                    className={s.fieldInput}
                    placeholder="e.g., Q1 2025, Spring 2025"
                  />
                ) : (
                  <div className={s.fieldValue}>{demoDay.approximateStartDate || '-'}</div>
                )}
              </div>
              <div className={s.overviewField}>
                <label className={s.fieldLabel}>Status</label>
                {isEditing ? (
                  <select
                    value={editFormData.status || ''}
                    onChange={(e) => handleEditFormChange('status', e.target.value)}
                    className={s.fieldInput}
                  >
                    <option value="UPCOMING">Upcoming</option>
                    <option value="REGISTRATION_OPEN">Registration Open</option>
                    <option value="EARLY_ACCESS">Early Access</option>
                    <option value="ACTIVE">Active</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                ) : (
                  <div className={s.fieldValue}>{demoDay.status}</div>
                )}
              </div>
              <div className={clsx(s.overviewField)}>
                <label className={s.fieldLabel}>Title</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.title || ''}
                    onChange={(e) => handleEditFormChange('title', e.target.value)}
                    className={s.fieldInput}
                  />
                ) : (
                  <div className={s.fieldValue}>{demoDay.title}</div>
                )}
              </div>
              <div className={clsx(s.overviewField)}>
                <label className={s.fieldLabel}>URL Slug</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editFormData.slugURL || ''}
                    onChange={(e) => handleEditFormChange('slugURL', e.target.value)}
                    className={s.fieldInput}
                    placeholder="e.g., crypto-day-2025"
                  />
                ) : (
                  <div className={s.fieldValue}>{demoDay.slugURL}</div>
                )}
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Short Description</label>
                {isEditing ? (
                  <RichTextEditor
                    value={editFormData.shortDescription || ''}
                    onChange={(value) => handleEditFormChange('shortDescription', value)}
                    maxLength={250}
                  />
                ) : (
                  <RichText text={demoDay.shortDescription || ''} className={s.fieldValue} />
                )}
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Description</label>
                {isEditing ? (
                  <RichTextEditor
                    value={editFormData.description || ''}
                    onChange={(value) => handleEditFormChange('description', value)}
                  />
                ) : (
                  <RichText text={demoDay.description} className={s.fieldValue} />
                )}
              </div>
            </div>
          </div>

          {/* Participants Section */}
          <div className={s.participants}>
            <div className={s.participantsHeader}>
              <div className={s.participantsHeaderTop}>
                <h2 className={s.participantsTitle}>Participants</h2>
                <div className={s.participantsActions}>
                  <button onClick={() => setShowAddParticipantModal(true)} className={clsx(s.editButton, s.primary)}>
                    Add Participant
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                  >
                    Upload Investors CSV
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className={s.tabs}>
                <button
                  className={clsx(s.tab, { [s.active]: activeTab === 'applications' })}
                  onClick={() => setActiveTab('applications')}
                >
                  Applications {participants && activeTab === 'applications' && `(${participants.total})`}
                </button>
                <button
                  className={clsx(s.tab, { [s.active]: activeTab === 'investors' })}
                  onClick={() => setActiveTab('investors')}
                >
                  Investors {participants && activeTab === 'investors' && `(${participants.total})`}
                </button>
                <button
                  className={clsx(s.tab, { [s.active]: activeTab === 'founders' })}
                  onClick={() => setActiveTab('founders')}
                >
                  Founders {participants && activeTab === 'founders' && `(${participants.total})`}
                </button>
              </div>

              {/* Filters */}
              <div className={s.participantsFilters}>
                <input
                  type="text"
                  placeholder="Search by name or email"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={clsx(s.input)}
                />
                {activeTab !== 'applications' && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={s.filterSelect}
                  >
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="INVITED">Invited</option>
                    <option value="ENABLED">Enabled</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Participants Table */}
          <div className={s.participantsTable}>
            {participantsLoading ? (
              <div className={s.loadingState}>Loading participants...</div>
            ) : !participants || participants.participants?.length === 0 ? (
              <div className={s.emptyState}>No participants found</div>
            ) : (
              <div className={s.table}>
                {/* Header */}
                <div className={clsx(s.tableRow, s.tableHeader)}>
                  <div className={clsx(s.headerCell, s.first, s.flexible)}>Member</div>
                  {activeTab !== 'applications' && <div className={clsx(s.headerCell, s.flexible)}>Team</div>}
                  {activeTab === 'investors' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 200 }}>
                      Investor Type
                    </div>
                  )}
                  {activeTab === 'investors' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 150 }}>
                      Early Access
                    </div>
                  )}
                  {activeTab === 'founders' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 200 }}>
                      Pitch Materials
                    </div>
                  )}
                  {activeTab !== 'applications' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 150 }}>
                      Invite Accepted
                    </div>
                  )}
                  {activeTab !== 'applications' && (
                    <div className={clsx(s.headerCell, s.fixed)} style={{ width: 150 }}>
                      Type
                    </div>
                  )}
                  <div
                    className={clsx(s.headerCell, s.fixed)}
                    style={{ width: activeTab === 'applications' ? 250 : 150 }}
                  >
                    {activeTab === 'applications' ? 'Action' : 'Status'}
                  </div>
                </div>

                {/* Body */}
                {participants.participants
                  .filter((participant) => activeTab === 'applications' || participant.status !== 'PENDING')
                  .map((participant) => (
                    <div key={participant.uid} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.first, s.flexible)}>
                        <div className="flex items-center">
                          {participant.member?.profilePicture && (
                            <Image
                              className="mr-3 h-8 w-8 rounded-full"
                              src={participant.member.profilePicture}
                              alt=""
                              width={32}
                              height={32}
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {participant.member?.name || participant.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {participant.member?.email || participant.email}
                            </div>
                          </div>
                        </div>
                      </div>
                      {activeTab !== 'applications' && (
                        <div className={clsx(s.bodyCell, s.flexible)}>
                          {activeTab === 'founders'
                            ? (() => {
                                const memberTeams = participant.member?.teamMemberRoles || [];
                                const currentTeamUid = participant.teamUid || '';

                                if (memberTeams.length === 0) {
                                  return <span className="text-gray-400">No teams</span>;
                                }

                                return (
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={currentTeamUid}
                                      onChange={(e) => {
                                        const selectedTeam = memberTeams.find(
                                          (role) => role.team.uid === e.target.value
                                        );
                                        if (selectedTeam) {
                                          handleUpdateParticipantTeam(
                                            participant.uid,
                                            participant.member?.name || participant.name,
                                            e.target.value,
                                            selectedTeam.team.name
                                          );
                                        }
                                      }}
                                      disabled={updateParticipantMutation.isPending}
                                      className={`flex-1 rounded-full border-0 px-2 py-1 text-xs font-semibold ${
                                        currentTeamUid ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                                      } disabled:opacity-50`}
                                    >
                                      <option value="">Select team...</option>
                                      {memberTeams.map((role) => (
                                        <option key={role.team.uid} value={role.team.uid}>
                                          {role.team.name}
                                          {role.mainTeam ? ' (Main)' : ''}
                                        </option>
                                      ))}
                                    </select>
                                    {currentTeamUid && (
                                      <a
                                        href={`${WEB_UI_BASE_URL}/teams/${currentTeamUid}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center text-blue-600 hover:text-blue-800"
                                        title="Open team page"
                                      >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                                          <path
                                            d="M12.5003 4V10.5C12.5003 10.6326 12.4476 10.7598 12.3538 10.8536C12.2601 10.9473 12.1329 11 12.0003 11C11.8677 11 11.7405 10.9473 11.6467 10.8536C11.553 10.7598 11.5003 10.6326 11.5003 10.5V5.20687L4.35403 12.3538C4.26021 12.4476 4.13296 12.5003 4.00028 12.5003C3.8676 12.5003 3.74035 12.4476 3.64653 12.3538C3.55271 12.2599 3.5 12.1327 3.5 12C3.5 11.8673 3.55271 11.7401 3.64653 11.6462L10.7934 4.5H5.50028C5.36767 4.5 5.24049 4.44732 5.14672 4.35355C5.05296 4.25979 5.00028 4.13261 5.00028 4C5.00028 3.86739 5.05296 3.74021 5.14672 3.64645C5.24049 3.55268 5.36767 3.5 5.50028 3.5H12.0003C12.1329 3.5 12.2601 3.55268 12.3538 3.64645C12.4476 3.74021 12.5003 3.86739 12.5003 4Z"
                                            fill="currentColor"
                                          />
                                        </svg>
                                      </a>
                                    )}
                                  </div>
                                );
                              })()
                            : (() => {
                                const team =
                                  participant.member?.teamMemberRoles.find((role) => role.mainTeam)?.team ||
                                  participant.member?.teamMemberRoles[0]?.team;

                                return team ? (
                                  <a
                                    href={`${WEB_UI_BASE_URL}/teams/${team.uid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                                  >
                                    {team.name}
                                    <svg className="ml-1 w-4" fill="none" stroke="currentColor" viewBox="0 0 16 16">
                                      <path
                                        d="M12.5003 4V10.5C12.5003 10.6326 12.4476 10.7598 12.3538 10.8536C12.2601 10.9473 12.1329 11 12.0003 11C11.8677 11 11.7405 10.9473 11.6467 10.8536C11.553 10.7598 11.5003 10.6326 11.5003 10.5V5.20687L4.35403 12.3538C4.26021 12.4476 4.13296 12.5003 4.00028 12.5003C3.8676 12.5003 3.74035 12.4476 3.64653 12.3538C3.55271 12.2599 3.5 12.1327 3.5 12C3.5 11.8673 3.55271 11.7401 3.64653 11.6462L10.7934 4.5H5.50028C5.36767 4.5 5.24049 4.44732 5.14672 4.35355C5.05296 4.25979 5.00028 4.13261 5.00028 4C5.00028 3.86739 5.05296 3.74021 5.14672 3.64645C5.24049 3.55268 5.36767 3.5 5.50028 3.5H12.0003C12.1329 3.5 12.2601 3.55268 12.3538 3.64645C12.4476 3.74021 12.5003 3.86739 12.5003 4Z"
                                        fill="currentColor"
                                      />
                                    </svg>
                                  </a>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                );
                              })()}
                        </div>
                      )}
                      {activeTab === 'founders' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 200 }}>
                          {(() => {
                            const team = participant.team;
                            if (!team) {
                              return <span className="text-gray-400">-</span>;
                            }

                            const fundraisingProfile = team.fundraisingProfiles?.[0];
                            if (!fundraisingProfile) {
                              return (
                                <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                                  not provided
                                </span>
                              );
                            }

                            const hasOnePager = !!fundraisingProfile.onePagerUpload;
                            const hasVideo = !!fundraisingProfile.videoUpload;

                            let label = '';
                            let bgColor = 'bg-gray-100';
                            let textColor = 'text-gray-600';

                            if (hasOnePager && hasVideo) {
                              label = 'pitch deck, pitch video';
                              bgColor = 'bg-green-100';
                              textColor = 'text-green-800';
                            } else if (hasOnePager) {
                              label = 'pitch deck';
                              bgColor = 'bg-blue-100';
                              textColor = 'text-blue-800';
                            } else if (hasVideo) {
                              label = 'pitch video';
                              bgColor = 'bg-purple-100';
                              textColor = 'text-purple-800';
                            } else {
                              label = 'not provided';
                            }

                            return (
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${bgColor} ${textColor}`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                      {activeTab === 'investors' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 200 }}>
                          {(() => {
                            const profileType = participant.member?.investorProfile?.type;
                            if (!profileType) {
                              return (
                                <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                                  not provided
                                </span>
                              );
                            }

                            const typeConfig = {
                              ANGEL: { label: 'Angel', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
                              FUND: { label: 'Fund', bgColor: 'bg-green-100', textColor: 'text-green-800' },
                              ANGEL_AND_FUND: {
                                label: 'Angel + Fund',
                                bgColor: 'bg-purple-100',
                                textColor: 'text-purple-800',
                              },
                            };

                            const config = typeConfig[profileType as keyof typeof typeConfig];

                            return (
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                  config?.bgColor || 'bg-gray-100'
                                } ${config?.textColor || 'text-gray-600'}`}
                              >
                                {config?.label || profileType}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                      {activeTab === 'investors' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 150 }}>
                          <select
                            value={participant.hasEarlyAccess ? 'yes' : 'no'}
                            onChange={(e) =>
                              handleUpdateParticipantEarlyAccess(participant.uid, e.target.value === 'yes')
                            }
                            disabled={updateParticipantMutation.isPending}
                            className={clsx(
                              'inline-flex rounded-full border-0 px-2 py-1 text-xs font-semibold disabled:opacity-50',
                              participant.hasEarlyAccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            )}
                          >
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                      )}
                      {activeTab !== 'applications' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 150 }}>
                          {participant.member?.accessLevel === 'L0' || !participant.member?.externalId ? (
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
                          ) : (
                            <svg
                              className="mx-auto h-5 w-5 text-green-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}

                      {activeTab !== 'applications' && (
                        <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 150 }}>
                          <select
                            value={participant.type}
                            onChange={(e) =>
                              handleUpdateParticipantType(
                                participant.uid,
                                participant.member?.name || participant.name,
                                e.target.value as 'INVESTOR' | 'FOUNDER'
                              )
                            }
                            disabled={updateParticipantMutation.isPending}
                            className={`inline-flex rounded-full border-0 px-2 py-1 text-xs font-semibold ${
                              participant.type === 'INVESTOR'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            } disabled:opacity-50`}
                          >
                            <option value="INVESTOR">Investor</option>
                            <option value="FOUNDER">Founder</option>
                          </select>
                        </div>
                      )}

                      <div
                        className={clsx(s.bodyCell, s.fixed)}
                        style={{ width: activeTab === 'applications' ? 250 : 150 }}
                      >
                        {activeTab === 'applications' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedParticipantForDetails(participant);
                                setShowApplicationDetailsModal(true);
                              }}
                              className="flex-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              title="View application details"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handleApproveClick(participant)}
                              disabled={updateParticipantMutation.isPending}
                              className="flex-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Approve application"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                handleReject(participant.uid, participant.member?.name || participant.name)
                              }
                              disabled={updateParticipantMutation.isPending}
                              className="flex-1 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Reject application"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <select
                            value={participant.status}
                            onChange={(e) =>
                              handleUpdateParticipantStatus(
                                participant.uid,
                                e.target.value as 'PENDING' | 'INVITED' | 'ENABLED' | 'DISABLED'
                              )
                            }
                            disabled={updateParticipantMutation.isPending}
                            className={`inline-flex rounded-full border-0 px-2 py-1 text-xs font-semibold ${getParticipantStatusColor(
                              participant.status
                            )} disabled:opacity-50`}
                          >
                            <option value="PENDING">Pending</option>
                            {participant.member?.accessLevel === 'L0' || !participant.member?.externalId ? (
                              <option value="INVITED">Invited</option>
                            ) : (
                              ''
                            )}
                            <option value="ENABLED">Enabled</option>
                            <option value="DISABLED">Disabled</option>
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {participants?.totalPages > 1 && participants.total > 0 && (
            <div className={s.pagination}>
              <div className={s.paginationInfo}>
                Showing {(participants.page - 1) * participants.limit + 1} to{' '}
                {Math.min(participants.page * participants.limit, participants.total)} of {participants.total}{' '}
                {activeTab === 'applications' ? 'applications' : activeTab === 'investors' ? 'investors' : 'founders'}
              </div>
              <div className={s.paginationControls}>
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                  className={clsx(s.paginationButton, currentPage === 1 ? s.disabled : '')}
                >
                  Previous
                </button>
                <span className={s.paginationCurrent}>
                  Page {participants.page} of {participants.totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={participants.page >= participants.totalPages}
                  className={clsx(s.paginationButton, participants.page >= participants.totalPages ? s.disabled : '')}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        <AddParticipantModal
          isOpen={showAddParticipantModal}
          onClose={() => setShowAddParticipantModal(false)}
          demoDayUid={demoDay.uid}
        />

        <UploadParticipantsModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          demoDayUid={demoDay.uid}
        />

        <ApproveParticipantModal
          isOpen={showApproveModal}
          onClose={() => {
            setShowApproveModal(false);
            setSelectedParticipantForApproval(null);
          }}
          participant={selectedParticipantForApproval}
          onApprove={handleApprove}
          isLoading={updateParticipantMutation.isPending}
        />

        <ApplicationDetailsModal
          isOpen={showApplicationDetailsModal}
          onClose={() => {
            setShowApplicationDetailsModal(false);
            setSelectedParticipantForDetails(null);
          }}
          participant={selectedParticipantForDetails}
        />
      </div>
    </ApprovalLayout>
  );
};

export default DemoDayDetailPage;
