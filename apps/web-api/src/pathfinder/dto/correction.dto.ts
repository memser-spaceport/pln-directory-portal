/**
 * PL Path Finder — human correction / crosswalk-resolution payloads.
 * A correction is the persisted record of an investment-team override; it feeds
 * the next recompute and seeds the future Affinity write-back.
 *
 * Contract: subject_type names the ID DOMAIN of subject_id (what kind of thing
 * subject_id identifies); field names the attribute being corrected. E.g. a
 * caliber override on path 190 is { subject_type: 'path', subject_id: '190',
 * field: 'caliber' } — never subject_type 'caliber'.
 */

export const CORRECTION_SUBJECT_TYPES = ['path', 'crosswalk', 'entity', 'action', 'curation'] as const;
export type CorrectionSubjectType = (typeof CORRECTION_SUBJECT_TYPES)[number];

/** Attributes correctable on a PathfinderPath. */
export const PATH_CORRECTION_FIELDS = ['caliber', 'connector_type', 'valid', 'note'] as const;

export interface CreateCorrectionDto {
  /** ID domain of subject_id: path | crosswalk | entity | action | curation */
  subject_type: string;
  /** PathfinderPath.id for 'path'; crosswalk id / canonical id / investor id otherwise. */
  subject_id: string;
  /** Attribute being corrected. For 'path': caliber | connector_type | valid | note. */
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
