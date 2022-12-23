import { client } from '@protocol-labs-network/shared/data-access';
import { getTeam } from './index';

jest.mock('@protocol-labs-network/shared/data-access', () => ({
  client: {
    teams: {
      getTeam: jest.fn().mockResolvedValue({
        body: {
          uid: 'uid-crooks-and-sons',
          name: 'Crooks and Sons',
          logo: {
            uid: 'uid-image-1',
            cid: 'cid',
            width: 33,
            height: 33,
            url: 'https://loremflickr.com/640/480/animals',
            filename: 'image-1',
            size: 33,
            type: 'WEBP',
            version: 'ORIGINAL',
            thumbnailToUid: null,
            createdAt: '2022-03-10T01:47:16.101Z',
            updatedAt: '2022-12-09T03:45:03.694Z',
          },
          logoUid: 'uid-image-1',
          blog: 'http://gruesome-reinscription.net',
          website: 'http://curvy-harpsichord.org',
          twitterHandler: 'Brenna',
          shortDescription:
            'Ullam error nulla beatae amet quia enim molestias.',
          longDescription:
            'Voluptatum iure voluptate quibusdam tempora. Natus repudiandae adipisci est sed. Aspernatur est eaque. Iure accusamus velit ut soluta.',
          plnFriend: false,
          startDate: '2022-02-05T06:50:34.559Z',
          endDate: '2022-12-09T08:55:14.516Z',
          createdAt: '2022-03-10T01:47:16.101Z',
          updatedAt: '2022-12-09T03:45:03.694Z',
          fundingStageUid: 'uid-series-a',
          technologies: [
            {
              uid: 'ipfs',
              title: 'IPFS',
              definition: null,
              createdAt: '2022-07-10T15:14:35.893Z',
              updatedAt: '2022-12-09T15:14:45.290Z',
              industryCategoryUid: 'uid-ipfs',
            },
            {
              uid: 'filecoin',
              title: 'Filecoin',
              definition: null,
              createdAt: '2022-05-03T15:48:01.691Z',
              updatedAt: '2022-12-09T14:29:32.247Z',
              industryCategoryUid: 'uid-filecoin',
            },
          ],
          industryTags: [
            {
              uid: 'uid-video-app--storage',
              title: 'Video app & storage',
              definition: null,
              createdAt: '2022-07-10T15:14:35.893Z',
              updatedAt: '2022-12-09T15:14:45.290Z',
              industryCategoryUid: 'uid-other',
            },
            {
              uid: 'uid-decentralized-identity',
              title: 'Decentralized Identity',
              definition: null,
              createdAt: '2022-05-03T15:48:01.691Z',
              updatedAt: '2022-12-09T14:29:32.247Z',
              industryCategoryUid: 'uid-use-case-applications',
            },
            {
              uid: 'uid-vrar',
              title: 'VR/AR',
              definition: null,
              createdAt: '2022-05-15T03:03:36.987Z',
              updatedAt: '2022-12-09T08:25:49.759Z',
              industryCategoryUid: 'uid-ecosystem',
            },
          ],
          acceleratorPrograms: [
            {
              uid: 'uid-cypher',
              title: 'Cypher',
              createdAt: '2021-12-17T14:35:20.515Z',
              updatedAt: '2022-12-09T02:03:22.910Z',
            },
            {
              uid: 'uid-faber',
              title: 'Faber',
              createdAt: '2022-05-05T06:25:42.548Z',
              updatedAt: '2022-12-08T22:28:07.558Z',
            },
            {
              uid: 'uid-tachyon',
              title: 'Tachyon',
              createdAt: '2022-11-19T13:51:01.541Z',
              updatedAt: '2022-12-08T21:28:21.424Z',
            },
          ],
          fundingStage: {
            uid: 'uid-series-a',
            title: 'Series A',
            createdAt: '2022-06-03T13:50:22.472Z',
            updatedAt: '2022-12-09T00:14:46.849Z',
          },
          teamMemberRoles: [
            { member: { uid: 'uid-01' } },
            { member: { uid: 'uid-02' } },
            { member: { uid: 'uid-01' } },
            { member: { uid: 'uid-03' } },
            { member: { uid: 'uid-02' } },
          ],
        },

        status: 200,
      }),
    },
  },
}));

describe('getTeam', () => {
  it('should call getTeam appropriately', async () => {
    const id = 'uid-crooks-and-sons';
    const { team, status } = await getTeam(id);

    expect(client.teams.getTeam).toBeCalledWith({
      params: { uid: id },
    });
    expect(team).toEqual({
      id: 'uid-crooks-and-sons',
      name: 'Crooks and Sons',
      logo: 'https://loremflickr.com/640/480/animals',
      website: 'http://curvy-harpsichord.org',
      twitter: 'Brenna',
      shortDescription: 'Ullam error nulla beatae amet quia enim molestias.',
      longDescription:
        'Voluptatum iure voluptate quibusdam tempora. Natus repudiandae adipisci est sed. Aspernatur est eaque. Iure accusamus velit ut soluta.',
      filecoinUser: true,
      ipfsUser: true,
      fundingStage: 'Series A',
      tags: ['Video app & storage', 'Decentralized Identity', 'VR/AR'],
      acceleratorPrograms: ['Cypher', 'Faber', 'Tachyon'],
      members: ['uid-01', 'uid-02', 'uid-03'],
      contactMethod: null,
    });
    expect(status).toEqual(200);
  });
});
