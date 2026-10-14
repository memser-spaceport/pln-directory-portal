// FEATURE-ENV ONLY — never merge (branch lab-2837-env-seed only).
/**
 * FEATURE-ENV ONLY — never merge. Lives on the unmerged branch `lab-2837-env-seed`.
 *
 * Side-effect module: imported by main.ts (and cli.ts) BEFORE AppModule, so the SES recipient guard is on
 * `AWS.SES.prototype` before any Nest module, provider, lifecycle hook, event listener or cron can run.
 * A separate module is needed because import statements are hoisted: a call written after the imports in
 * main.ts would run only after AppModule's whole import graph had been evaluated.
 */
import { installFeatureEnvEmailGuard } from './feature-env-email-guard';

installFeatureEnvEmailGuard();
