import React, { useState } from 'react';
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
import { WEB_UI_BASE_URL } from '../../utils/constants';
import clsx from 'clsx';

import s from './styles.module.scss';

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
                  {activeTab === 'investors' && <div className={clsx(s.headerCell, s.flexible)}>Investor Type</div>}
                  {activeTab === 'founders' && <div className={clsx(s.headerCell, s.flexible)}>Pitch Materials</div>}
                  <div className={clsx(s.headerCell, s.fixed)} style={{ width: 150 }}>
                    Invite Accepted
                  </div>
                  <div className={clsx(s.headerCell, s.fixed)} style={{ width: 150 }}>
                    Status
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
                      {(() => {
                        // For founders, use participant.team
                        // For investors, use member.teamMemberRoles[0].team
                        let team;

                        if (activeTab === 'founders') {
                          team = participant.team;
                        } else {
                          team =
                            participant.member?.teamMemberRoles.find((role) => role.mainTeam)?.team ||
                            participant.member?.teamMemberRoles[0]?.team;
                        }

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
                    {activeTab === 'founders' && (
                      <div className={clsx(s.bodyCell, s.flexible)}>
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
                      <div className={clsx(s.bodyCell, s.flexible)}>
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
                    <div className={clsx(s.bodyCell, s.fixed)} style={{ width: 150 }}>
                      {participant.member?.accessLevel === 'L0' ? (
                        <svg
                          className="mx-auto h-5 w-5 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                        {participant.member?.accessLevel === 'L0' && <option value="INVITED">Invited</option>}
                        <option value="ENABLED">Enabled</option>
                        <option value="DISABLED">Disabled</option>
                      </select>
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
      </div>
    </ApprovalLayout>
  );
};

export default DemoDayDetailPage;
