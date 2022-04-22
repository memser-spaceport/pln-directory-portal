import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function getTeamHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`🚫 Method ${req.method} Not Allowed`);

    return;
  }

  const { id } = req.query as { id: string };

  try {
    const team = await airtableService.getTeam(id);
    res.status(200).json(team);
  } catch (error) {
    res.status(500).json({ msg: 'Ups, something went wrong 😕' });
  }
}
