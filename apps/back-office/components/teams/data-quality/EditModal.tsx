import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { clsx } from 'clsx';

import { EnrichmentTeam, FieldEntry, FieldKey } from '../../../hooks/teams/useTeamsEnrichmentReview';
import { useGetTeam, TeamDetail } from '../../../hooks/teams/useGetTeam';
import { useUpdateAdminTeam, TeamUpdatePayload } from '../../../hooks/teams/useUpdateAdminTeam';
import { useApproveEnrichmentFields } from '../../../hooks/teams/useApproveEnrichmentFields';
import { FIELD_KEYS, FIELD_LABELS, getEntry, needsReview } from './constants';
import { WEB_UI_BASE_URL } from '../../../utils/constants';
import api from '../../../utils/api';
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

/**
 * Pulls each field's CURRENT value off the live `Team` row (via teamDetail).
 * The input always reflects what's actually saved on Team — the AI candidate
 * from `TeamEnrichment` is offered separately as the "AI suggestion" pill
 * under the input (admins click `Apply` to copy it into the input).
 *
 * Falls back to the enrichment entry only when Team has no value on file —
 * that way a brand-new team whose Team.<field> is null still shows the AI
 * candidate in the input rather than an empty box.
 */
function teamToForm(teamDetail: TeamDetail, enrichmentTeam: EnrichmentTeam): TeamUpdatePayload {
  const getContent = (key: EditableFieldKey): string => {
    const teamVal = teamDetail[key as keyof TeamDetail];
    if (typeof teamVal === 'string' && teamVal.trim() !== '') return teamVal;
    const aiVal = pickAiSideValue(enrichmentTeam.fields[key]);
    return aiVal ?? '';
  };

  return {
    website: getContent('website'),
    blog: getContent('blog'),
    contactMethod: getContent('contactMethod'),
    twitterHandler: getContent('twitterHandler'),
    linkedinHandler: getContent('linkedinHandler'),
    shortDescription: getContent('shortDescription'),
    longDescription: getContent('longDescription'),
  };
}

/**
 * Extracts the `TeamEnrichment` (AI) side from a review entry, regardless of
 * which side is currently `content` vs `alternative`:
 *
 *   - `status === ChangedByUser` → primary `content` is the Team value, so
 *     the AI candidate lives in `alternative` (which always has
 *     `fromSide: 'enrichment'` for this status).
 *   - `status === Enriched | CannotEnrich` → primary `content` IS the AI
 *     candidate; `alternative`, if present, is the Team-side value.
 *
 * Returns null when no AI side is available (e.g. enrichment never produced a
 * candidate for this field).
 */
function pickAiSideValue(entry: FieldEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.metadata.status === 'ChangedByUser') {
    if (entry.alternative?.fromSide === 'enrichment' && typeof entry.alternative.content === 'string') {
      return entry.alternative.content;
    }
    return null;
  }
  return typeof entry.content === 'string' ? entry.content : null;
}

export function EditModal({ team, authToken, onClose }: Props) {
  const [form, setForm] = useState<TeamUpdatePayload | null>(null);
  const [initialForm, setInitialForm] = useState<TeamUpdatePayload | null>(null);
  const [confirmedFields, setConfirmedFields] = useState<Set<FieldKey>>(new Set());
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const isSavingRef = useRef(false);

  const { data: teamDetail, isLoading: detailLoading } = useGetTeam(team?.uid ?? null, !!team);
  const updateMutation = useUpdateAdminTeam();
  const approveMutation = useApproveEnrichmentFields();

  useEffect(() => {
    if (teamDetail && team && !isSavingRef.current) {
      const initial = teamToForm(teamDetail, team);
      setForm(initial);
      setInitialForm(initial);
    }
  }, [teamDetail, team]);

  useEffect(() => {
    if (!team) {
      isSavingRef.current = false;
      setForm(null);
      setInitialForm(null);
      setConfirmedFields(new Set());
      setSelectedLogoFile(null);
    }
  }, [team]);

  useEffect(() => {
    document.body.style.overflow = team ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [team]);

  // One-directional: Set.add is idempotent, so calling on an already-confirmed field is a no-op.
  const addConfirm = (key: FieldKey) => {
    setConfirmedFields((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!team || !form || !authToken || !teamDetail || !initialForm) return;
    isSavingRef.current = true;

    const fieldsToApprove = [...confirmedFields];

    const changedData: TeamUpdatePayload = {};
    (Object.keys(form) as (keyof TeamUpdatePayload)[]).forEach((key) => {
      if ((form[key] ?? '') !== (initialForm[key] ?? '')) changedData[key] = form[key];
    });

    if (Object.keys(changedData).length === 0 && fieldsToApprove.length === 0) {
      onClose();
      return;
    }

    // Upload logo file at save time (follows the same pattern as EditTeamDetailsForm)
    let uploadedLogoUid: string | null = null;
    if (selectedLogoFile) {
      try {
        const formData = new FormData();
        formData.append('file', selectedLogoFile);
        const response = await api.post('/v1/images', formData, {
          headers: { 'content-type': 'multipart/form-data' },
        });
        uploadedLogoUid = response.data.image.uid;
      } catch {
        toast.error('Failed to upload logo. Please try again.');
        return;
      }
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
          fields: fieldsToApprove.map((key) =>
            key === 'logo' && uploadedLogoUid ? { key, content: uploadedLogoUid } : { key }
          ),
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

  const reviewableEditableKeys: EditableFieldKey[] = team
    ? EDITABLE_KEYS.filter((key) => !!getEntry(team, key) && needsReview(team, key))
    : [];

  const showLogoRow = Boolean(team && needsReview(team, 'logo'));

  const hasNoLowFields = !detailLoading && form && reviewableEditableKeys.length === 0 && !showLogoRow;

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
                  {team.name} <ExternalLinkIcon />
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
                      Below are the fields the AI Judge scored as <strong>Low quality</strong>. The value may have been
                      provided by a user or by AI enrichment — either way it needs your review. Read the Judge&apos;s
                      reason next to each field, edit the value if needed, then click <strong>Confirm</strong>. Fields
                      stay editable until you press <strong>Save changes</strong>.
                    </div>
                  </div>

                  {showLogoRow && (
                    <LogoRow
                      team={team}
                      teamDetail={teamDetail}
                      confirmed={confirmedFields.has('logo')}
                      onConfirm={() => addConfirm('logo')}
                      onFileSelected={setSelectedLogoFile}
                    />
                  )}

                  {reviewableEditableKeys.map((key) => {
                    const enrichmentEntry = team.fields[key];
                    const isConfirmed = confirmedFields.has(key);
                    // Input always reflects the Team-side value (via
                    // `teamToForm` initial + form state). AI candidate lives
                    // in `aiValue` regardless of which side ended up as the
                    // API's primary `content`. Render the AI value as the
                    // "AI suggestion: …" pill with an Apply button.
                    const aiValue = pickAiSideValue(enrichmentEntry);
                    // Source badge reflects `fieldsMeta.status`, NOT whether
                    // Team.<field> is populated. A Team value can legitimately
                    // be an AI-promoted value from a prior judge run — when
                    // the latest enrichment re-runs (`mode=all`), the old
                    // AI value still sits on Team while a new candidate
                    // lives on TeamEnrichment (bench case: Akave's blog, both
                    // sides AI-derived from different runs). Showing
                    // "Provided by user" in that case would mislead the
                    // admin into thinking they're choosing between user
                    // truth vs AI guess. Only `ChangedByUser` is truly
                    // user-typed; everything else is some flavor of AI.
                    const isAI = enrichmentEntry?.metadata?.status !== 'ChangedByUser';
                    // Show the AI pill only when the AI value differs from
                    // what's currently in the input (otherwise Apply would
                    // be a no-op).
                    const showAiSuggestion =
                      !!aiValue && aiValue.trim() !== '' &&
                      aiValue.trim().toLowerCase() !== (form[key] ?? '').trim().toLowerCase();
                    // The judge note describes the value the judge actually
                    // evaluated, which depends on fieldsMeta.status:
                    //   - ChangedByUser → judge read Team (= the user's
                    //     value), so the note refers to what's in the input.
                    //     Render in the header row, next to Confirm.
                    //   - Enriched / CannotEnrich → judge read TeamEnrichment
                    //     (= the AI candidate). When the AI value differs
                    //     from the input (Team had its own value), render
                    //     next to the AI suggestion pill so admins can see
                    //     which value the note describes. When the AI value
                    //     equals the input (common case: Team.<field> was
                    //     empty, so `teamToForm` initialized the input to
                    //     the AI candidate), the pill is hidden — fall back
                    //     to the header row so the note still surfaces.
                    //     Without this fallback, the note disappears for
                    //     every Enriched field judged on a previously-empty
                    //     Team slot.
                    const judgmentNote = enrichmentEntry?.judgment?.note;
                    const noteAppliesToAi =
                      !!judgmentNote &&
                      enrichmentEntry?.metadata?.status !== 'ChangedByUser' &&
                      showAiSuggestion;
                    const noteAppliesToInput =
                      !!judgmentNote &&
                      (enrichmentEntry?.metadata?.status === 'ChangedByUser' || !showAiSuggestion);

                    return (
                      <div key={key} className={s.editFieldRow}>
                        <div className={s.editFieldHeader}>
                          {/* Left: label + source badge */}
                          <div className={s.editFieldMeta}>
                            <span className={s.fieldLabel}>{FIELD_LABELS[key]}</span>
                            {enrichmentEntry && (
                              <span className={clsx(s.sourceBadge, isAI ? s.sourceBadgeAI : s.sourceBadgeUser)}>
                                {isAI ? <SparkleIcon /> : <UserIcon />}
                                {isAI ? 'AI Suggestion' : 'Provided by user'}
                              </span>
                            )}
                          </div>
                          {/* Right: judge note (only when it applies to the
                              input value, i.e. status=ChangedByUser) + Confirm
                              button. AI-side notes are rendered next to the
                              AI suggestion pill instead. */}
                          <div className={s.editFieldActions}>
                            {noteAppliesToInput && (
                              <span className={s.editJudgmentNote} title={judgmentNote}>
                                {judgmentNote}
                              </span>
                            )}
                            <button
                              className={clsx(s.confirmBtn, { [s.confirmBtnActive]: isConfirmed })}
                              onClick={() => addConfirm(key)}
                            >
                              <CheckIcon />
                              {isConfirmed ? 'Confirmed' : 'Confirm'}
                            </button>
                          </div>
                        </div>

                        {MULTILINE[key] ? (
                          <textarea
                            className={s.editTextarea}
                            value={form[key] ?? ''}
                            onChange={(e) => {
                              setForm((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
                              addConfirm(key);
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
                              addConfirm(key);
                            }}
                          />
                        )}

                        {showAiSuggestion && (
                          <div className={s.editSuggestion}>
                            <span className={s.editSuggestionLabel}>
                              <SparkleIcon /> AI suggestion:
                            </span>
                            <span className={s.editSuggestionValue}>{aiValue}</span>
                            {noteAppliesToAi && (
                              <span className={s.editJudgmentNote} title={judgmentNote}>
                                {judgmentNote}
                              </span>
                            )}
                            <button
                              className={s.editApplyBtn}
                              onClick={() => {
                                setForm((prev) => (prev ? { ...prev, [key]: aiValue } : prev));
                                addConfirm(key);
                              }}
                            >
                              Apply
                            </button>
                          </div>
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
  onConfirm,
  onFileSelected,
}: {
  team: EnrichmentTeam;
  teamDetail?: TeamDetail;
  confirmed: boolean;
  onConfirm: () => void;
  onFileSelected: (file: File) => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState<'current' | 'suggested' | 'upload' | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
    };
  }, [uploadedPreviewUrl]);

  const currentLogoUrl = teamDetail?.logo?.url ?? null;
  const candidateLogoUrl =
    team.logo?.content && typeof team.logo.content === 'object' && 'url' in team.logo.content
      ? (team.logo.content as { url: string }).url
      : null;

  const handleSlotClick = (slot: 'current' | 'suggested') => {
    setSelectedSlot(slot);
    onConfirm();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Only JPG and PNG images are allowed.');
      return;
    }

    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
    setUploadedPreviewUrl(URL.createObjectURL(file));
    setSelectedSlot('upload');
    onFileSelected(file);
    onConfirm();
  };

  const judgeNote = team.logo?.judgment?.note;

  return (
    <div className={s.editFieldRow}>
      <div className={s.editFieldHeader}>
        <div className={s.editFieldMeta}>
          <span className={s.fieldLabel}>{FIELD_LABELS['logo']}</span>
        </div>
        <div className={s.editFieldActions}>
          {judgeNote && (
            <span className={s.editJudgmentNote} title={judgeNote}>
              {judgeNote}
            </span>
          )}
          <button className={clsx(s.confirmBtn, { [s.confirmBtnActive]: confirmed })} onClick={onConfirm}>
            <CheckIcon />
            {confirmed ? 'Confirmed' : 'Confirm'}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className={s.logoCompare}>
        {/* Current */}
        <div
          className={clsx(s.logoSlot, { [s.logoSlotSelected]: selectedSlot === 'current' })}
          onClick={() => handleSlotClick('current')}
        >
          {selectedSlot === 'current' && (
            <span className={s.logoSlotCheck}>
              <CheckIcon />
            </span>
          )}
          <div className={s.logoSlotLabel}>Current</div>
          <div className={s.logoSlotPreview}>
            {currentLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentLogoUrl} alt="Current logo" className={s.logoSlotImg} />
            ) : (
              <ImageIcon />
            )}
          </div>
        </div>

        {/* AI suggestion — disabled when no candidate */}
        <div
          className={clsx(s.logoSlot, s.logoSlotSuggested, {
            [s.logoSlotSelected]: selectedSlot === 'suggested',
            [s.logoSlotDisabled]: !candidateLogoUrl,
          })}
          onClick={candidateLogoUrl ? () => handleSlotClick('suggested') : undefined}
        >
          {selectedSlot === 'suggested' && (
            <span className={s.logoSlotCheck}>
              <CheckIcon />
            </span>
          )}
          <div className={s.logoSlotLabel}>
            <SparkleIcon /> AI suggestion
          </div>
          <div className={s.logoSlotPreview}>
            {candidateLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={candidateLogoUrl} alt="AI suggestion logo" className={s.logoSlotImg} />
            ) : (
              <ImageIcon />
            )}
          </div>
        </div>

        {/* Upload */}
        <div
          className={clsx(s.logoSlot, s.logoSlotUpload, { [s.logoSlotSelected]: selectedSlot === 'upload' })}
          onClick={() => fileInputRef.current?.click()}
        >
          {selectedSlot === 'upload' && (
            <span className={s.logoSlotCheck}>
              <CheckIcon />
            </span>
          )}
          <div className={s.logoSlotLabel}>Upload</div>
          <div className={s.logoSlotPreview}>
            {uploadedPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploadedPreviewUrl} alt="Uploaded logo" className={s.logoSlotImg} />
            ) : (
              <UploadIcon />
            )}
          </div>
        </div>
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

const ExternalLinkIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
    style={{ verticalAlign: 'middle', marginLeft: 4, color: '#94a3b8' }}
  >
    <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
  </svg>
);

const ImageIcon = () => (
  <svg width="28" height="28" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" style={{ color: '#cbd5e1' }}>
    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z" />
  </svg>
);

const UploadIcon = () => (
  <svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" style={{ color: '#94a3b8' }}>
    <path d="M240,136v64a16,16,0,0,1-16,16H32a16,16,0,0,1-16-16V136a16,16,0,0,1,16-16H80a8,8,0,0,1,0,16H32v64H224V136H176a8,8,0,0,1,0-16h48A16,16,0,0,1,240,136ZM85.66,77.66,120,43.31V144a8,8,0,0,0,16,0V43.31l34.34,34.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,77.66Z" />
  </svg>
);
