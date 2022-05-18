import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';
import { getListRequestOptionsFromQuery } from '../../../utils/api/list.utils';

export default async function getTeamsHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`🚫 Method ${req.method} Not Allowed`);

    return;
  }

  try {
    const options = getListRequestOptionsFromQuery(req.query);
    const teams = await airtableService.getTeams(options);
    res.status(200).json(teams);
  } catch (error) {
    res.status(500).json({ msg: 'Ups, something went wrong 😕' });
  }
}
