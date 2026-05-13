import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';

import { EnrichmentTeam, FieldKey } from '../../../hooks/teams/useTeamsEnrichmentReview';
import { FIELD_KEYS, FIELD_LABELS } from './constants';
import { formatFieldContent } from './utils';
import s from '../data-quality.module.scss';

interface Props {
  team: EnrichmentTeam | null;
  approved: Record<string, boolean>;
  isSaving: boolean;
  onClose: () => void;
  onApproveField: (teamUid: string, fieldKey: FieldKey) => void;
}

export function ReviewModal({ team, approved, isSaving, onClose, onApproveField }: Props) {
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
              <h2 className={s.modalTitle}>{team.name} — Enrichment Review</h2>
              <button className={s.closeButton} onClick={onClose}>
                ✕
              </button>
            </div>

            <div className={s.modalBody}>
              {FIELD_KEYS.map((key) => {
                const entry = key === 'logo' ? team.logo : team.fields[key];
                if (!entry) return null;

                const stateKey = `${team.uid}:${key}`;
                const isApproved = !!approved[stateKey];
                const isUserOwned = !entry.promotable;

                return (
                  <div key={key} className={clsx(s.fieldRow, { [s.fieldRowApproved]: isApproved })}>
                    <div className={s.fieldInfo}>
                      <div className={s.fieldMeta}>
                        <span className={s.fieldLabel}>{FIELD_LABELS[key]}</span>
                        <span className={clsx(s.badge, entry.promotable ? s.badgeAI : s.badgeUser)}>
                          {entry.promotable ? 'AI' : 'User'}
                        </span>
                      </div>
                      <span className={s.fieldValue}>{formatFieldContent(entry.content)}</span>
                      {entry.judgment?.note && (
                        <span className={s.judgmentNote}>
                          AI note: {entry.judgment.note}
                          {entry.judgment.score !== undefined && ` (score: ${entry.judgment.score})`}
                        </span>
                      )}
                    </div>
                    <div className={s.toggleWrapper}>
                      <button
                        className={clsx(s.toggle, {
                          [s.toggleOn]: isApproved,
                          [s.toggleDisabled]: isApproved || isSaving || isUserOwned,
                        })}
                        disabled={isApproved || isSaving || isUserOwned}
                        onClick={() => onApproveField(team.uid, key)}
                        title={isUserOwned ? 'User-owned field — cannot be overridden' : undefined}
                      >
                        <span className={s.toggleThumb} />
                      </button>
                      <span className={s.toggleStatus}>
                        {isApproved
                          ? 'Approved'
                          : isSaving
                          ? 'Saving…'
                          : isUserOwned
                          ? 'User-owned'
                          : 'Approve'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
