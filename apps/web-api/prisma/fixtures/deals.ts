import { prisma } from '../index';

export async function deals() {
  return [
    {
      uid: 'deal_vercel',
      vendorName: 'Vercel',
      category: 'Hosting & Infrastructure',
      audience: 'All Founders',
      shortDescription: 'Free Vercel credits for startups.',
      fullDescription: 'Seeded Vercel deal for admin/user API testing.',
      redemptionInstructions: 'Contact Protocol Labs admin to redeem.',
      status: 'ACTIVE',
    },
    {
      uid: 'deal_figma',
      vendorName: 'Figma',
      category: 'Design',
      audience: 'PL Funded Founders',
      shortDescription: 'Free Figma organization plan.',
      fullDescription: 'Seeded Figma deal for testing report issue flow.',
      redemptionInstructions: 'Use internal PL promo instructions.',
      status: 'ACTIVE',
    },
  ];
}

export async function dealSubmissions() {
  const author = await prisma.member.findFirst({
    orderBy: { id: 'asc' },
    select: { uid: true },
  });

  if (!author) {
    throw new Error('No Member found for dealSubmissions seed');
  }

  return [
    {
      uid: 'deal_submission_datadog',
      vendorName: 'Datadog',
      category: 'Analytics & Monitoring',
      audience: 'All Founders',
      shortDescription: 'Free monitoring credits.',
      fullDescription: 'Datadog credits for eligible startups.',
      redemptionInstructions: 'Apply through partner request flow.',
      authorMemberUid: author.uid,
      status: 'OPEN',
    },
    {
      uid: 'deal_submission_aws',
      vendorName: 'AWS',
      category: 'Cloud Credits & Infra',
      audience: 'PL Funded Founders',
      shortDescription: 'AWS Activate credits.',
      fullDescription: 'AWS cloud credits for startups.',
      redemptionInstructions: 'Submit via AWS Activate partner path.',
      authorMemberUid: author.uid,
      status: 'APPROVED',
      reviewedByMemberUid: author.uid,
      reviewedAt: new Date('2026-03-20T10:00:00.000Z'),
    },
  ];
}

export async function dealIssues() {
  const author = await prisma.member.findFirst({
    orderBy: { id: 'asc' },
    select: { uid: true },
  });

  if (!author) {
    throw new Error('No Member found for dealIssues seed');
  }

  return [
    {
      uid: 'deal_issue_vercel_1',
      dealUid: 'deal_vercel',
      authorMemberUid: author.uid,
      description: 'Promo code does not work during checkout.',
      status: 'OPEN',
    },
    {
      uid: 'deal_issue_vercel_2',
      dealUid: 'deal_vercel',
      authorMemberUid: author.uid,
      description: 'Instructions are outdated.',
      status: 'RESOLVED',
      resolvedByMemberUid: author.uid,
      resolvedAt: new Date('2026-03-21T12:00:00.000Z'),
    },
    {
      uid: 'deal_issue_figma_1',
      dealUid: 'deal_figma',
      authorMemberUid: author.uid,
      description: 'Workspace upgrade was not applied.',
      status: 'OPEN',
    },
  ];
}

export async function dealWhitelists() {
  const member = await prisma.member.findFirst({
    orderBy: { id: 'asc' },
    select: { uid: true },
  });

  if (!member) {
    throw new Error('No Member found for dealWhitelists seed');
  }

  return [
    {
      memberUid: member.uid,
    },
  ];
}
