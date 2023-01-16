import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';
import { env } from 'process';
import { getMembersDirectoryRequestParametersFromQuery } from '../../../utils/list.utils';

export default async function getMembersHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`🚫 Method ${req.method} Not Allowed`);

    return;
  }

  try {
    const params = getMembersDirectoryRequestParametersFromQuery(req.query);
    let url = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_MEMBERS_TABLE_ID}?api_key=${env.AIRTABLE_API_KEY}&${params}`;
    let offset = req.query.offset;

    // When offset is not provided, it's because we don't have it yet,
    // and it means it is the first request.
    // Therefore, we need to make a redundant request to the first page of
    // members, so that we get the offset for the second page.
    if (!offset) {
      const airtableResponse = await fetch(url);
      const data = await airtableResponse.json();

      // When the response has no offset, it means there are no more pages
      // available to be fetch, and therefore, we return an empty list of members
      // that will be concatenated in already existing list of members.
      if (!data.offset) {
        // Cache response data in the browser for 1 minute,
        // and in the CDN for 5 minutes, while keeping it stale for 7 days.
        res.setHeader(
          'Cache-Control',
          'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
        );

        res.status(200).json({
          offset: '',
          members: [],
        });

        return;
      }

      // When there is an offset, we update our local variable so that we can
      // request the second page of members, that will effectively be returned
      // to our list component for concatenation.
      offset = data.offset;
    }

    url += `&offset=${offset}`;

    // Actual request for a new page of members.
    const airtableResponse = await fetch(url);
    const data = await airtableResponse.json();

    // Cache response data in the browser for 1 minute,
    // and in the CDN for 5 minutes, while keeping it stale for 7 days.
    res.setHeader(
      'Cache-Control',
      'public, max-age=60, s-maxage=300, stale-while-revalidate=604800'
    );

    res.status(200).json({
      offset: data.offset, // The offset for the next page.
      members: airtableService.parseMembers(data.records),
    });
  } catch (error) {
    res.status(500).json({ error: { msg: 'Ups, something went wrong 😕' } });
  }
}
