import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { clsx } from 'clsx';

import { EnrichmentTeam, FieldKey, FieldEntry } from '../../../hooks/teams/useTeamsEnrichmentReview';
import { useGetTeam, TeamDetail } from '../../../hooks/teams/useGetTeam';
import { useUpdateAdminTeam, TeamUpdatePayload } from '../../../hooks/teams/useUpdateAdminTeam';
import { useApproveEnrichmentFields } from '../../../hooks/teams/useApproveEnrichmentFields';
import { FIELD_KEYS, FIELD_LABELS } from './constants';
import s from '../data-quality.module.scss';

interface Props {
  team: EnrichmentTeam | null;
  authToken: string | null | undefined; // needed for save only
  onClose: () => void;
}

type EditableFieldKey = Exclude<FieldKey, 'logo'>;

const EDITABLE_KEYS = FIELD_KEYS.filter((k): k is EditableFieldKey => k !== 'logo');

const MULTILINE: Partial<Record<EditableFieldKey, boolean>> = {
  shortDescription: true,
  longDescription: true,
};

function getScore(entry: FieldEntry | undefined): number | undefined {
  return entry?.judgment?.score;
}

function scoreLabel(score: number | undefined): string {
  if (score === undefined) return '—';
  return score >= 50 ? 'High' : 'Low';
}

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

  const { data: teamDetail, isLoading: detailLoading } = useGetTeam(team?.uid ?? null, !!team);
  const updateMutation = useUpdateAdminTeam();
  const approveMutation = useApproveEnrichmentFields();

  useEffect(() => {
    if (teamDetail) setForm(teamToForm(teamDetail));
  }, [teamDetail]);

  useEffect(() => {
    if (!team) setForm(null);
  }, [team]);

  const handleSave = () => {
    if (!team || !form || !authToken) return;

    // Collect all enriched field keys that are reviewable (promotable = AI-enriched)
    const fieldsToApprove = FIELD_KEYS.filter((key) => {
      const entry = key === 'logo' ? team.logo : team.fields[key];
      return entry?.promotable;
    });

    updateMutation.mutate(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      { authToken: authToken!, uid: team.uid, data: form },
      {
        onSuccess: () => {
          // Mark all AI-enriched fields as confirmed (high confidence) so they
          // no longer appear as Low in the table
          if (fieldsToApprove.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            approveMutation.mutate({ authToken: authToken!, teamUid: team.uid, fields: fieldsToApprove });
          }
          toast.success('Team updated successfully.');
          onClose();
        },
        onError: () => toast.error('Failed to save changes. Please try again.'),
      }
    );
  };

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
              <h2 className={s.modalTitle}>{team.name}</h2>
              <button className={s.closeButton} onClick={onClose}>✕</button>
            </div>

            <div className={s.modalBody}>
              {detailLoading && <p className={s.modalLoading}>Loading team data…</p>}

              {!detailLoading && form && (
                <>
                  {/* Logo — read-only */}
                  <LogoRow team={team} teamDetail={teamDetail} />

                  {/* Editable text fields */}
                  {EDITABLE_KEYS.map((key) => {
                    const enrichmentEntry = team.fields[key];
                    const score = getScore(enrichmentEntry);

                    return (
                      <div key={key} className={s.editFieldRow}>
                        <div className={s.editFieldHeader}>
                          <span className={s.fieldLabel}>{FIELD_LABELS[key]}</span>
                          {enrichmentEntry ? (
                            <div className={s.editEnrichmentStatus}>
                              <span className={clsx(s.badge, enrichmentEntry.promotable ? s.badgeAI : s.badgeUser)}>
                                {enrichmentEntry.promotable ? 'AI' : 'User'}
                              </span>
                              <span className={clsx(s.evalBadge, score !== undefined && score >= 50 ? s.evalHigh : s.evalLow)}>
                                {scoreLabel(score)}
                              </span>
                              {enrichmentEntry.judgment?.note && (
                                <span className={s.editJudgmentNote} title={enrichmentEntry.judgment.note}>
                                  {enrichmentEntry.judgment.note}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className={s.editNoEnrichment}>No enrichment data</span>
                          )}
                        </div>

                        {MULTILINE[key] ? (
                          <textarea
                            className={s.editTextarea}
                            value={form[key] ?? ''}
                            onChange={(e) => setForm((prev) => prev ? { ...prev, [key]: e.target.value } : prev)}
                            rows={3}
                          />
                        ) : (
                          <input
                            type="text"
                            className={s.editInput}
                            value={form[key] ?? ''}
                            onChange={(e) => setForm((prev) => prev ? { ...prev, [key]: e.target.value } : prev)}
                          />
                        )}

                        {enrichmentEntry?.promotable && typeof enrichmentEntry.content === 'string' && enrichmentEntry.content && (
                          <div className={s.editSuggestion}>
                            <span className={s.editSuggestionLabel}>AI suggestion:</span>
                            <span className={s.editSuggestionValue}>{enrichmentEntry.content}</span>
                            <button
                              className={s.editApplyBtn}
                              onClick={() => setForm((prev) => prev ? { ...prev, [key]: enrichmentEntry.content as string } : prev)}
                            >
                              Apply
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className={s.modalFooter}>
              <button className={s.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <button
                className={s.saveButton}
                disabled={!form || updateMutation.isPending || detailLoading}
                onClick={handleSave}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LogoRow({ team, teamDetail }: { team: EnrichmentTeam; teamDetail?: TeamDetail }) {
  const currentLogoUrl = teamDetail?.logo?.url ?? null;
  const candidateLogoUrl =
    team.logo?.content && typeof team.logo.content === 'object' && 'url' in team.logo.content
      ? team.logo.content.url
      : null;
  const logoScore = team.logo?.judgment?.score;

  return (
    <div className={s.editFieldRow}>
      <div className={s.editFieldHeader}>
        <span className={s.fieldLabel}>{FIELD_LABELS['logo']}</span>
        {team.logo ? (
          <div className={s.editEnrichmentStatus}>
            <span className={clsx(s.badge, team.logo.promotable ? s.badgeAI : s.badgeUser)}>
              {team.logo.promotable ? 'AI' : 'User'}
            </span>
            <span className={clsx(s.evalBadge, logoScore !== undefined && logoScore >= 50 ? s.evalHigh : s.evalLow)}>
              {scoreLabel(logoScore)}
            </span>
          </div>
        ) : (
          <span className={s.editNoEnrichment}>No enrichment data</span>
        )}
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
