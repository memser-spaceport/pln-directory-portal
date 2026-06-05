/**
 * Factory for `FieldJudgment` records produced by deterministic rules.
 * Centralizes the `judgedVia` source-tagging so every rule emits the same
 * shape and reviewers see consistent provenance in the admin UI.
 */

import {
  FieldConfidence,
  FieldJudgment,
  JudgmentSource,
  JudgmentVerdict,
} from '../team-enrichment.types';

export function makeJudgment(
  confidence: FieldConfidence,
  verdict: JudgmentVerdict,
  score: number,
  note: string,
  judgedVia: JudgmentSource = JudgmentSource.Corroboration
): FieldJudgment {
  return { confidence, verdict, score, note, judgedVia };
}

/** True when the verdict is an `agrees + high` — the gate for auto-promotion. */
export function isAgreesHigh(v: FieldJudgment | undefined): boolean {
  return !!v && v.verdict === JudgmentVerdict.Agrees && v.confidence === FieldConfidence.High;
}

/** True when the verdict is a `disagrees + low` — the gate for definitive negatives. */
export function isDisagreesLow(v: FieldJudgment | undefined): boolean {
  return !!v && v.verdict === JudgmentVerdict.Disagrees && v.confidence === FieldConfidence.Low;
}

/** True when a verdict should be queued for admin review. */
export function needsManualReview(v: FieldJudgment): boolean {
  if (v.verdict === JudgmentVerdict.Disagrees) return true;
  if (v.verdict === JudgmentVerdict.Uncertain) return true;
  if (v.confidence === FieldConfidence.Low) return true;
  return false;
}
