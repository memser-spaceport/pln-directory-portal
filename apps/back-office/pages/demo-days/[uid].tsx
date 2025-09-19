import React, { useState, useMemo } from 'react';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { useDemoDayDetails } from '../../hooks/demo-days/useDemoDayDetails';
import { useDemoDayParticipants } from '../../hooks/demo-days/useDemoDayParticipants';
import { useUpdateDemoDay } from '../../hooks/demo-days/useUpdateDemoDay';
import { useUpdateParticipant } from '../../hooks/demo-days/useUpdateParticipant';
import { AddParticipantModal } from '../../components/demo-days/AddParticipantModal';
import { UploadParticipantsModal } from '../../components/demo-days/UploadParticipantsModal';
import { UpdateDemoDayDto } from '../../screens/demo-days/types/demo-day';
import clsx from 'clsx';

import s from './styles.module.scss';

import { EditInvestorProfileModal } from '../../components/demo-days/EditInvestorProfileModal';
import { useGetInvestorProfile } from '../../hooks/demo-days/useGetInvestorProfile';

const DemoDayDetailPage = () => {
  const router = useRouter();
  const { uid } = router.query;
  const [authToken] = useCookie('plnadmin');
  const [activeTab, setActiveTab] = useState<'investors' | 'founders'>('investors');
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editFormData, setEditFormData] = useState<UpdateDemoDayDto>({});
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingMemberUid, setEditingMemberUid] = useState<string | null>(null);

  const updateDemoDayMutation = useUpdateDemoDay();
  const updateParticipantMutation = useUpdateParticipant();

  const { data: demoDay, isLoading: demoDayLoading } = useDemoDayDetails({
    authToken,
    uid: uid as string,
  });

  const { data: participants, isLoading: participantsLoading } = useDemoDayParticipants({
    authToken,
    demoDayUid: uid as string,
    query: {
      type: activeTab === 'investors' ? 'INVESTOR' : 'FOUNDER',
      search: searchTerm || undefined,
      status: (statusFilter as 'INVITED' | 'ENABLED' | 'DISABLED') || undefined,
      page: 1,
      limit: 50,
    },
  });

  const { data: editingInvestorProfile, isLoading: isProfileLoading } = useGetInvestorProfile(
    authToken,
    editingMemberUid ?? undefined,
    !!editingMemberUid
  );

  const editingInitial = useMemo(() => {
    if (!editingInvestorProfile) return undefined;
    return {
      investmentFocus: editingInvestorProfile.investmentFocus ?? [],
      investInStartupStages: editingInvestorProfile.investInStartupStages ?? [],
      investInFundTypes: editingInvestorProfile.investInFundTypes ?? [],
      typicalCheckSize: editingInvestorProfile.typicalCheckSize ?? undefined,
      secRulesAccepted: !!editingInvestorProfile.secRulesAccepted,
      teamUid: editingInvestorProfile.teamUid ?? undefined,
    };
  }, [editingInvestorProfile]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-green-600 bg-green-100';
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
      description: demoDay.description,
      startDate: demoDay.startDate,
      status: demoDay.status,
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditFormData({});
  };

  const handleSaveDemoDay = async () => {
    if (!authToken || !uid) return;

    try {
      await updateDemoDayMutation.mutateAsync({
        authToken,
        uid: uid as string,
        data: editFormData,
      });
      setIsEditing(false);
      setEditFormData({});
    } catch (error) {
      console.error('Error updating demo day:', error);
      alert('Failed to update demo day. Please try again.');
    }
  };

  const handleUpdateParticipantStatus = async (participantUid: string, status: 'INVITED' | 'ENABLED' | 'DISABLED') => {
    if (!authToken || !uid) return;

    try {
      await updateParticipantMutation.mutateAsync({
        authToken,
        demoDayUid: uid as string,
        participantUid,
        data: { status },
      });
    } catch (error) {
      console.error('Error updating participant status:', error);
      alert('Failed to update participant status. Please try again.');
    }
  };

  const handleEditFormChange = (field: keyof UpdateDemoDayDto, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

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
                <label className={s.fieldLabel}>Start Date</label>
                {isEditing ? (
                  <input
                    type="datetime-local"
                    value={editFormData.startDate ? new Date(editFormData.startDate).toISOString().slice(0, 16) : ''}
                    onChange={(e) => handleEditFormChange('startDate', e.target.value)}
                    className={s.fieldInput}
                  />
                ) : (
                  <div className={s.fieldValue}>{formatDate(demoDay.startDate)}</div>
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
                    <option value="ACTIVE">Active</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                ) : (
                  <div className={s.fieldValue}>{demoDay.status}</div>
                )}
              </div>
              <div className={clsx(s.overviewField, s.fullWidth)}>
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
              <div className={clsx(s.overviewField, s.fullWidth)}>
                <label className={s.fieldLabel}>Description</label>
                {isEditing ? (
                  <textarea
                    value={editFormData.description || ''}
                    onChange={(e) => handleEditFormChange('description', e.target.value)}
                    rows={3}
                    className={s.fieldTextarea}
                  />
                ) : (
                  <div className={s.fieldValue}>{demoDay.description}</div>
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
                    Upload CSV
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className={s.tabs}>
                <button
                  className={clsx(s.tab, { [s.active]: activeTab === 'investors' })}
                  onClick={() => setActiveTab('investors')}
                >
                  Investors
                </button>
                <button
                  className={clsx(s.tab, { [s.active]: activeTab === 'founders' })}
                  onClick={() => setActiveTab('founders')}
                >
                  Founders
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
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={s.filterSelect}
                >
                  <option value="">All Statuses</option>
                  <option value="INVITED">Invited</option>
                  <option value="ENABLED">Enabled</option>
                  <option value="DISABLED">Disabled</option>
                </select>
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
                  <div className={clsx(s.headerCell, s.flexible)}>Team</div>
                  <div className={clsx(s.headerCell, s.fixed)} style={{ width: 150 }}>
                    Status
                  </div>
                  <div className={clsx(s.headerCell, s.fixed)} style={{ width: 120 }}>
                    Actions
                  </div>
                </div>

                {/* Body */}
                {participants.participants.map((participant) => (
                  <div key={participant.uid} className={s.tableRow}>
                    <div className={clsx(s.bodyCell, s.first, s.flexible)}>
                      <div className="flex items-center">
                        {participant.member?.profilePicture && (
                          <img className="mr-3 h-8 w-8 rounded-full" src={participant.member.profilePicture} alt="" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {participant.member?.name || participant.name}
                          </div>
                          <div className="text-sm text-gray-500">{participant.member?.email || participant.email}</div>
                        </div>
                      </div>
                    </div>
                    <div className={clsx(s.bodyCell, s.flexible)}>
                      {participant.team ? (
                        <div className="text-sm text-gray-900">{participant.team.name}</div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 150 }}>
                      <select
                        value={participant.status}
                        onChange={(e) =>
                          handleUpdateParticipantStatus(
                            participant.uid,
                            e.target.value as 'INVITED' | 'ENABLED' | 'DISABLED'
                          )
                        }
                        disabled={updateParticipantMutation.isPending}
                        className={`inline-flex rounded-full border-0 px-2 py-1 text-xs font-semibold ${getParticipantStatusColor(
                          participant.status
                        )} disabled:opacity-50`}
                      >
                        <option value="INVITED">Invited</option>
                        <option value="ENABLED">Enabled</option>
                        <option value="DISABLED">Disabled</option>
                      </select>
                    </div>

                    <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 120 }}>
                      {(participant.type === 'INVESTOR') ? (
                        <button
                          onClick={() => {
                            const targetUid =
                              participant.member?.uid ||
                              (participant as any)?.memberUid || // some APIs return this at root
                              (participant as any)?.member?.uid; // extra safety

                            if (targetUid) {
                              setEditingMemberUid(targetUid);
                            } else {
                              console.warn('No memberUid found for investor; cannot open editor');
                              alert('This investor has no member account yet, so the profile cannot be edited.');
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                          title="Edit investor profile"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15.232 5.232l3.536 3.536M4 20h4.586a1 1 0 00.707-.293l9.414-9.414a2 2 0 00-2.828-2.828L6.465 16.465A1 1 0 006.172 17H4v3z" />
                          </svg>
                          Edit
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        <AddParticipantModal
          isOpen={showAddParticipantModal}
          onClose={() => setShowAddParticipantModal(false)}
          demoDayUid={uid as string}
        />

        <UploadParticipantsModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          demoDayUid={uid as string}
        />

        {editingMemberUid && (
          <EditInvestorProfileModal
            isOpen={!!editingMemberUid}
            onClose={() => setEditingMemberUid(null)}
            memberUid={editingMemberUid}
            initial={editingInitial}
          />
        )}
      </div>
    </ApprovalLayout>
  );
};

export default DemoDayDetailPage;
