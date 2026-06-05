import React from 'react';
import { clsx } from 'clsx';

import { EnrichmentTeam, FieldKey } from '../../../hooks/teams/useTeamsEnrichmentReview';
import { FIELD_KEYS, FIELD_LABELS, getEntry, isAIEnriched, needsReview } from './constants';
import { formatFieldContent } from './utils';
import s from '../../../pages/teams/data-quality.module.scss';

interface Props {
  team: EnrichmentTeam;
  confirmedKeys: Set<FieldKey>;
  isPending: boolean;
  onConfirm: (key: FieldKey) => void;
  onApply: (key: FieldKey, content: string) => void;
  onEdit: (team: EnrichmentTeam) => void;
}

export function NeedsReviewCell({ team, confirmedKeys, isPending, onConfirm, onApply, onEdit }: Props) {
  const lowFields = FIELD_KEYS.filter(
    (key) => needsReview(team, key) && !confirmedKeys.has(key)
  );

  if (lowFields.length === 0) {
    return <span className={s.reviewEmpty}>All good — no low-quality fields</span>;
  }

  return (
    <div className={s.reviewList}>
      {lowFields.map((key) => {
        const entry = getEntry(team, key);
        if (!entry) return null;

        const displayValue = formatFieldContent(entry.content);
        const fullValue = typeof entry.content === 'string' ? entry.content : displayValue;
        const isAI = isAIEnriched(entry);

        const alt = entry.alternative;
        // Narrow to string so downstream JSX needs no non-null assertions
        const suggestionContent =
          alt?.fromSide === 'enrichment' && typeof alt.content === 'string' && alt.content.trim() !== ''
            ? alt.content
            : null;

        return (
          <div key={key} className={s.reviewItem}>
            <div className={s.reviewItemMain}>
              <span className={s.reviewFieldName}>{FIELD_LABELS[key]}</span>
              <span className={s.reviewFieldValue} title={fullValue}>
                {displayValue || '(no value)'}
              </span>
              <span className={s.qualityBadgeLow}>
                {isAI ? <SparkleIcon /> : <UserIcon />}
                Low
              </span>
              <span className={s.cellActions}>
                <button
                  type="button"
                  className={s.iconBtn}
                  aria-label={`Edit ${FIELD_LABELS[key]}`}
                  onClick={() => onEdit(team)}
                  disabled={isPending}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className={clsx(s.iconBtn, s.iconBtnConfirm)}
                  aria-label={`Confirm ${FIELD_LABELS[key]}`}
                  onClick={() => onConfirm(key)}
                  disabled={isPending}
                >
                  <CheckIcon />
                </button>
              </span>
            </div>

            {suggestionContent !== null && (
              <div className={s.aiSuggestionCard}>
                <span className={s.aiSuggestionLabel}>
                  <SparkleIcon /> AI suggestion:
                </span>
                <span className={s.aiSuggestionValue} title={suggestionContent}>
                  {formatFieldContent(suggestionContent)}
                </span>
                <button
                  type="button"
                  className={s.aiApplyBtn}
                  aria-label={`Apply AI suggestion for ${FIELD_LABELS[key]}: ${suggestionContent}`}
                  onClick={() => onApply(key, suggestionContent)}
                  disabled={isPending}
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        );
      })}
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

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M12.8789 1.35156L13.3984 1.87109C14 2.47266 14 3.42969 13.3984 4.03125L12.5781 4.85156L9.89844 2.17188L10.7188 1.35156C11.3203 0.75 12.2773 0.75 12.8789 1.35156ZM4.70312 7.36719L9.26953 2.80078L11.9492 5.48047L7.38281 10.0469C7.21875 10.2109 7 10.3477 6.78125 10.4297L4.34766 11.2227C4.12891 11.3047 3.85547 11.25 3.69141 11.0586C3.5 10.8945 3.44531 10.6211 3.52734 10.4023L4.32031 7.96875C4.40234 7.75 4.53906 7.53125 4.70312 7.36719ZM2.625 2.5H5.25C5.71484 2.5 6.125 2.91016 6.125 3.375C6.125 3.86719 5.71484 4.25 5.25 4.25H2.625C2.13281 4.25 1.75 4.66016 1.75 5.125V12.125C1.75 12.6172 2.13281 13 2.625 13H9.625C10.0898 13 10.5 12.6172 10.5 12.125V9.5C10.5 9.03516 10.8828 8.625 11.375 8.625C11.8398 8.625 12.25 9.03516 12.25 9.5V12.125C12.25 13.5742 11.0742 14.75 9.625 14.75H2.625C1.17578 14.75 0 13.5742 0 12.125V5.125C0 3.67578 1.17578 2.5 2.625 2.5Z"
      fill="currentColor"
    />
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
