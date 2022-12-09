import { faker } from '@faker-js/faker';
import { prisma } from './../index';
import sample from 'lodash/sample';

const getIndustryCategoryUids = async () => {
  return await prisma.industryCategory.findMany({
    select: {
      uid: true,
    },
  });
};

export const industryTags = async () =>
  [
    'NFT',
    'Developer Tooling',
    'Software Development',
    'Social',
    'R&D',
    'Consumer',
    'DeFi',
    'Education',
    'Verifiable Storage & Privacy',
    'Data Tooling',
    'DAO Tooling',
    'Security',
    'Collaboration',
    'Data Science and Analytics',
    'Metaverse',
    'Gaming',
    'Data Markets',
    'Video app & storage',
    'Decentralized Identity',
    'Startup Funding & Development',
    'Ecosystem Growth',
    'Reputation Systems',
    'Creative Services',
    'AI',
    'Branding and Design',
    'VR/AR',
    'Events',
    'Consultancy',
    'Music app & storage',
    'CDN',
    'Hardware',
    'Privacy',
    'Wallet',
    'Trust & Safety',
    'BioTech',
    'Treasury management',
    'Photo',
    'Cryptography',
    'Messaging',
    'Website',
    'Payments',
    'Exchange',
    'Content Moderation',
    'Discontinued',
    'Hosting',
    'Search',
    'Video Conferencing',
    'HR',
    'Merch',
  ].map(async (industryTag) => {
    const categoryUids = await (
      await getIndustryCategoryUids()
    ).map((result) => result.uid);

    return {
      uid: faker.helpers.slugify(`uid-${industryTag.toLowerCase()}`),
      title: industryTag,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      industryCategoryUid: sample(categoryUids),
    };
  });
