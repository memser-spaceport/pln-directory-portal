import React from 'react';
import { clsx } from 'clsx';

import { EnrichmentTeam, FieldEntry, FieldKey } from '../../../hooks/teams/useTeamsEnrichmentReview';
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

function getLogoUrl(content: FieldEntry['content']): string | null {
  if (!content) return null;
  if (typeof content === 'string') return content.trim() || null;
  if (Array.isArray(content)) return null;
  if (typeof content === 'object' && 'url' in content) return content.url || null;
  return null;
}

export function NeedsReviewCell({ team, confirmedKeys, isPending, onConfirm, onApply, onEdit }: Props) {
  const lowFields = FIELD_KEYS.filter((key) => needsReview(team, key) && !confirmedKeys.has(key));

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
        const logoUrl = key === 'logo' ? getLogoUrl(entry.content) : null;

        const alt = entry.alternative;

        // Case 1: explicit alternative where the alternative.content is the AI candidate
        // (entry.content is the user's value, alternative.fromSide === 'enrichment')
        const explicitSuggestion =
          alt?.fromSide === 'enrichment' && typeof alt.content === 'string' && alt.content.trim() !== ''
            ? alt.content
            : null;

        // Case 2: entry.content itself is AI-enriched (status=Enriched, no explicit alternative).
        // Treat the content as the AI suggestion so the admin can explicitly Apply it.
        const implicitSuggestion =
          isAI && !explicitSuggestion && typeof entry.content === 'string' && entry.content.trim() !== ''
            ? entry.content
            : null;

        const suggestionContent = explicitSuggestion ?? implicitSuggestion;

        return (
          <div key={key} className={s.reviewItem}>
            <div className={s.reviewItemMain}>
              <span className={s.reviewFieldName}>{FIELD_LABELS[key]}</span>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className={s.reviewLogoThumb} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span className={s.reviewFieldValue} title={fullValue}>
                  {displayValue || '(no value)'}
                </span>
              )}
              {/*<span className={s.qualityBadgeLow}>*/}
              {/*  {isAI ? <SparkleIcon /> : <UserIcon />}*/}
              {/*  Low*/}
              {/*</span>*/}
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
                {key === 'logo' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={suggestionContent} alt="" className={s.reviewLogoThumb} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span className={s.aiSuggestionValue} title={suggestionContent}>
                    {formatFieldContent(suggestionContent)}
                  </span>
                )}
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
  <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119A8,8,0,0,0,137,123.78L191.85,144Zm32-104h16v16a8,8,0,0,0,16,0v-16h16a8,8,0,0,0,0-16H201v-16a8,8,0,0,0-16,0v16H169a8,8,0,0,0,0,16Zm64,48h-8v-8a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0v-8h8a8,8,0,0,0,0-16Z" />
  </svg>
);


const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96A16,16,0,0,0,227.31,73.37ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
  </svg>
);
