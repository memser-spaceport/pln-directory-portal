import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { clsx } from 'clsx';

import { EnrichmentTeam, FieldKey } from '../../../hooks/teams/useTeamsEnrichmentReview';
import { useGetTeam, TeamDetail } from '../../../hooks/teams/useGetTeam';
import { useUpdateAdminTeam, TeamUpdatePayload } from '../../../hooks/teams/useUpdateAdminTeam';
import { useApproveEnrichmentFields } from '../../../hooks/teams/useApproveEnrichmentFields';
import { FIELD_KEYS, FIELD_LABELS, UNJUDGED_SCORE, getEntry, isAIEnriched } from './constants';
import { WEB_UI_BASE_URL } from '../../../utils/constants';
import s from '../../../pages/teams/data-quality.module.scss';

interface Props {
  team: EnrichmentTeam | null;
  authToken: string | null | undefined;
  onClose: () => void;
}

type EditableFieldKey = Exclude<FieldKey, 'logo'>;

const EDITABLE_KEYS = FIELD_KEYS.filter((k): k is EditableFieldKey => k !== 'logo');

const MULTILINE: Partial<Record<EditableFieldKey, boolean>> = {
  shortDescription: true,
  longDescription: true,
};

function teamToForm(team: TeamDetail): TeamUpdatePayload {
  return {
    website: team.website ?? '',
    blog: team.blog ?? '',
    contactMethod: team.contactMethod ?? '',
    twitterHandler: team.twitterHandler ?? '',
    linkedinHandler: team.linkedinHandler ?? '',
    shortDescription: team.shortDescription ?? '',
    longDescription: team.longDescription ?? '',
  };
}

export function EditModal({ team, authToken, onClose }: Props) {
  const [form, setForm] = useState<TeamUpdatePayload | null>(null);
  const [confirmedFields, setConfirmedFields] = useState<Set<FieldKey>>(new Set());

  const { data: teamDetail, isLoading: detailLoading } = useGetTeam(team?.uid ?? null, !!team);
  const updateMutation = useUpdateAdminTeam();
  const approveMutation = useApproveEnrichmentFields();

  useEffect(() => {
    if (teamDetail) setForm(teamToForm(teamDetail));
  }, [teamDetail]);

  useEffect(() => {
    if (!team) {
      setForm(null);
      setConfirmedFields(new Set());
    }
  }, [team]);

  useEffect(() => {
    document.body.style.overflow = team ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [team]);

  const toggleConfirm = (key: FieldKey) => {
    setConfirmedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const autoConfirm = (key: FieldKey) => {
    if (!confirmedFields.has(key)) {
      setConfirmedFields((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
  };

  const handleSave = async () => {
    if (!team || !form || !authToken || !teamDetail) return;

    const fieldsToApprove = [...confirmedFields];

    const changedData: TeamUpdatePayload = {};
    (Object.keys(form) as (keyof TeamUpdatePayload)[]).forEach((key) => {
      const original = String(teamDetail[key as keyof TeamDetail] ?? '');
      if ((form[key] ?? '') !== original) changedData[key] = form[key];
    });

    if (Object.keys(changedData).length === 0 && fieldsToApprove.length === 0) {
      onClose();
      return;
    }

    try {
      if (Object.keys(changedData).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await updateMutation.mutateAsync({ authToken: authToken!, uid: team.uid, data: changedData });
      }
    } catch {
      toast.error('Failed to save changes. Please try again.');
      return;
    }

    try {
      if (fieldsToApprove.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await approveMutation.mutateAsync({
          authToken: authToken!,
          teamUid: team.uid,
          fields: fieldsToApprove.map((key) => ({ key })),
        });
      }
    } catch {
      toast.error('Changes saved, but failed to confirm fields. Please try again.');
      onClose();
      return;
    }

    toast.success('Team updated successfully.');
    onClose();
  };

  // Derive which editable keys have low scores — only those are shown
  const lowScoreEditableKeys: EditableFieldKey[] = team
    ? EDITABLE_KEYS.filter((key) => {
        const entry = getEntry(team, key);
        return !!entry && (entry.judgment?.score ?? UNJUDGED_SCORE) <= 90;
      })
    : [];

  const showLogoRow = Boolean(team?.logo && (team.logo.judgment?.score ?? UNJUDGED_SCORE) <= 90);

  const hasNoLowFields = !detailLoading && form && lowScoreEditableKeys.length === 0 && !showLogoRow;

  return (
    <AnimatePresence>
      {team && (
        <motion.div
          className={s.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={s.modal}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={s.modalHeader}>
              <div>
                <a
                  className={s.modalTitleLink}
                  href={`${WEB_UI_BASE_URL}/teams/${team.uid}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {team.name}
                </a>
                <p className={s.modalSubtitle}>Review enrichment data and confirm or edit fields.</p>
              </div>
              <button className={s.closeButton} onClick={onClose}>
                ✕
              </button>
            </div>

            <div className={s.modalBody}>
              {detailLoading && <p className={s.modalLoading}>Loading team data…</p>}

              {!detailLoading && form && (
                <>
                  <div className={s.modalInfoBanner}>
                    <span className={s.modalInfoIcon} aria-hidden="true">
                      <InfoIcon />
                    </span>
                    <div className={s.modalInfoText}>
                      <div className={s.modalInfoTitle}>How to review</div>
                      Below are fields the AI Judge scored as <strong>Low quality</strong>. The value may have been
                      provided by a user or by AI enrichment — either way it needs your review. Edit the value if
                      needed, then click <strong>Confirm</strong>. Fields stay editable until you press{' '}
                      <strong>Save changes</strong>.
                    </div>
                  </div>

                  {showLogoRow && (
                    <LogoRow
                      team={team}
                      teamDetail={teamDetail}
                      confirmed={confirmedFields.has('logo')}
                      onToggleConfirm={() => toggleConfirm('logo')}
                    />
                  )}

                  {lowScoreEditableKeys.map((key) => {
                    const enrichmentEntry = team.fields[key];
                    const isConfirmed = confirmedFields.has(key);
                    const isAI = enrichmentEntry ? isAIEnriched(enrichmentEntry) : false;

                    return (
                      <div key={key} className={s.editFieldRow}>
                        <div className={s.editFieldHeader}>
                          <div className={s.editFieldMeta}>
                            <span className={s.fieldLabel}>{FIELD_LABELS[key]}</span>
                            {enrichmentEntry && (
                              <span className={clsx(s.sourceBadge, isAI ? s.sourceBadgeAI : s.sourceBadgeUser)}>
                                {isAI ? <SparkleIcon /> : <UserIcon />}
                                {isAI ? 'AI Suggestion' : 'Provided by user'}
                              </span>
                            )}
                            {enrichmentEntry?.judgment?.note && (
                              <span className={s.editJudgmentNote} title={enrichmentEntry.judgment.note}>
                                {enrichmentEntry.judgment.note}
                              </span>
                            )}
                          </div>
                          <button
                            className={clsx(s.confirmBtn, { [s.confirmBtnActive]: isConfirmed })}
                            onClick={() => toggleConfirm(key)}
                          >
                            <CheckIcon />
                            {isConfirmed ? 'Confirmed' : 'Confirm'}
                          </button>
                        </div>

                        {MULTILINE[key] ? (
                          <textarea
                            className={s.editTextarea}
                            value={form[key] ?? ''}
                            onChange={(e) => {
                              setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
                              autoConfirm(key);
                            }}
                            rows={3}
                          />
                        ) : (
                          <input
                            type="text"
                            className={s.editInput}
                            value={form[key] ?? ''}
                            onChange={(e) => {
                              setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
                              autoConfirm(key);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {hasNoLowFields && (
                    <p className={s.modalEmptyState}>Nothing to confirm — all low-quality fields have been resolved.</p>
                  )}
                </>
              )}
            </div>

            <div className={s.modalFooter}>
              <button className={s.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <button
                className={s.saveButton}
                disabled={
                  !form || !teamDetail || updateMutation.isPending || approveMutation.isPending || detailLoading
                }
                onClick={handleSave}
              >
                {updateMutation.isPending || approveMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LogoRow({
  team,
  teamDetail,
  confirmed,
  onToggleConfirm,
}: {
  team: EnrichmentTeam;
  teamDetail?: TeamDetail;
  confirmed: boolean;
  onToggleConfirm: () => void;
}) {
  const currentLogoUrl = teamDetail?.logo?.url ?? null;
  const candidateLogoUrl =
    team.logo?.content && typeof team.logo.content === 'object' && 'url' in team.logo.content
      ? team.logo.content.url
      : null;

  return (
    <div className={s.editFieldRow}>
      <div className={s.editFieldHeader}>
        <div className={s.editFieldMeta}>
          <span className={s.fieldLabel}>{FIELD_LABELS['logo']}</span>
          {team.logo && (
            <span className={clsx(s.sourceBadge, isAIEnriched(team.logo) ? s.sourceBadgeAI : s.sourceBadgeUser)}>
              {isAIEnriched(team.logo) ? <SparkleIcon /> : <UserIcon />}
              {isAIEnriched(team.logo) ? 'AI Suggestion' : 'Provided by user'}
            </span>
          )}
        </div>
        <button className={clsx(s.confirmBtn, { [s.confirmBtnActive]: confirmed })} onClick={onToggleConfirm}>
          <CheckIcon />
          {confirmed ? 'Confirmed' : 'Confirm'}
        </button>
      </div>
      <div className={s.logoPreviewRow}>
        {currentLogoUrl && (
          <div className={s.logoPreview}>
            <span className={s.logoPreviewLabel}>Current</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentLogoUrl} alt="Current logo" className={s.logoPreviewImg} />
          </div>
        )}
        {candidateLogoUrl && candidateLogoUrl !== currentLogoUrl && (
          <div className={s.logoPreview}>
            <span className={s.logoPreviewLabel}>AI candidate</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={candidateLogoUrl} alt="AI candidate logo" className={s.logoPreviewImg} />
          </div>
        )}
      </div>
    </div>
  );
}

const SparkleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L8 1z" />
    <path d="M13 10l.75 1.75L15.5 12.5l-1.75.75L13 15l-.75-1.75L10.5 12.5l1.75-.75L13 10z" opacity="0.7" />
  </svg>
);

const UserIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const InfoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
