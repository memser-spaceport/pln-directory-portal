import React from 'react';

import { TDealForm } from '../../types/deal';
import { DEAL_AUDIENCE_OPTIONS } from '../../constants';
import s from './DealPreview.module.scss';

interface Props {
  data: TDealForm;
  logoPreviewUrl: string | null;
  isPublishing: boolean;
  publishDisabled?: boolean;
  onBack: () => void;
  onPublish: () => void;
}

export const DealPreview = ({ data, logoPreviewUrl, isPublishing, publishDisabled, onBack, onPublish }: Props) => {
  const audienceLabel = DEAL_AUDIENCE_OPTIONS.find((o) => o.value === data.audience)?.label ?? data.audience;

  return (
    <>
      <div className={s.header}>
        <div className={s.avatar}>
          {logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreviewUrl} alt="Vendor logo" className={s.avatarImg} />
          ) : (
            <div className={s.avatarPlaceholder}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="4" stroke="#8897ae" strokeWidth="1.5" />
                <circle cx="9" cy="9" r="2" stroke="#8897ae" strokeWidth="1.5" />
                <path
                  d="M3 17l4-4 3 3 4-5 7 6"
                  stroke="#8897ae"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
        </div>

        <div className={s.dealDetails}>
          <div className={s.description}>
            <p className={s.vendorName}>{data.vendorName || '—'}</p>
            <p className={s.shortDesc}>{data.shortDescription}</p>
          </div>

          <div className={s.tags}>
            {data.category && <span className={s.badge}>{data.category}</span>}
            {data.audience && <span className={s.badge}>{audienceLabel}</span>}
          </div>

          <div className={s.meta}>
            <span className={s.metaItem}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 13.5s-.5 0-.5-.5.5-4 6.5-4 6.5 3.5 6.5 4-.5.5-.5.5H2z"
                  stroke="#455468"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="8.5" cy="5" r="3" stroke="#455468" strokeWidth="1.2" />
              </svg>
              0 using
            </span>
            <span className={s.metaDot} />
            <span className={s.metaItem}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="#455468" strokeWidth="1.2" />
                <path
                  d="M5.5 8l2 2 3-3"
                  stroke="#455468"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              No issues
            </span>
          </div>
        </div>

        <button type="button" className={s.closeBtn} onClick={onBack} aria-label="Back to edit">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5l10 10" stroke="#455468" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={s.content}>
        <section className={s.section}>
          <h3 className={s.sectionTitle}>About the deal</h3>
          <div className={s.richText} dangerouslySetInnerHTML={{ __html: data.fullDescription || '' }} />
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Redemption Instructions</h3>
          <div
            className={s.redemptionInstructionsBody}
            dangerouslySetInnerHTML={{ __html: data.redemptionInstructions || '' }}
          />
        </section>
      </div>

      <div className={s.footer}>
        <button type="button" className={s.backBtn} onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11.25 13.5L6.75 9l4.5-4.5"
              stroke="#455468"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Edit
        </button>
        <button type="button" className={s.publishBtn} onClick={onPublish} disabled={isPublishing || publishDisabled}>
          {isPublishing ? 'Publishing...' : 'Publish Deal'}
        </button>
      </div>
    </>
  );
};

export default DealPreview;
