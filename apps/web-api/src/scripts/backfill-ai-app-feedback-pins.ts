/**
 * Turn element pins on AI App feedback filed before they were stored as rows
 * into AiAppFeedbackPin rows, so the live-app overlay shows them too.
 *
 *   npm run api:backfill-ai-app-feedback-pins            # dry-run
 *   npm run api:backfill-ai-app-feedback-pins -- --apply
 *
 * Reads the `data-pins` payload the LabOS feedback dialog embeds in the
 * feedback HTML. Safe to rerun: feedback that already has pin rows is skipped.
 * A pin that does not validate is reported and left out, never guessed at.
 * Environment is recorded as 'prod' (nothing captured it before).
 */
import { PrismaClient } from '@prisma/client';
import { parsePinsFromFeedbackHtml, toPinCreateData } from '../ai-apps/ai-app-feedback-pins';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const candidates = await prisma.aiAppFeedback.findMany({
    where: { text: { contains: 'ai-app-element-pins' }, pins: { none: {} } },
    select: { uid: true, appUid: true, text: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`feedback with embedded pins and no pin rows: ${candidates.length}`);

  let pinsCreated = 0;
  let pinsSkipped = 0;
  for (const feedback of candidates) {
    const { pins, skipped } = parsePinsFromFeedbackHtml(feedback.text);
    pinsSkipped += skipped;
    console.log(
      `  ${feedback.uid} (app ${feedback.appUid}): ${pins.length} pins${skipped ? `, ${skipped} skipped` : ''}`
    );
    if (!apply || pins.length === 0) continue;
    await prisma.aiAppFeedbackPin.createMany({
      data: pins.map((pin) => ({ ...toPinCreateData(pin), feedbackUid: feedback.uid })),
    });
    pinsCreated += pins.length;
  }

  console.log(
    apply
      ? `created ${pinsCreated} pin rows; skipped ${pinsSkipped} invalid pins`
      : `dry-run: would create pins for ${candidates.length} feedback rows (${pinsSkipped} invalid pins would be skipped). Rerun with --apply.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
