/**
 * PL Path Finder — human correction / crosswalk-resolution payloads.
 * A correction is the persisted record of an investment-team override; it feeds
 * the next recompute and seeds the future Affinity write-back.
 */

export interface CreateCorrectionDto {
  /** path | caliber | connector | crosswalk | entity | action | curation */
  subject_type: string;
  subject_id: string;
  field: string;
  old_value?: unknown;
  new_value?: unknown;
  note?: string;
}

export interface ResolveCrosswalkDto {
  /** true = confirm the link, false = reject it. */
  confirmed: boolean;
  note?: string;
}
