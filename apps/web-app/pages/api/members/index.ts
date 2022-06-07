import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';

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
    const members = await airtableService.getMembers();
    res.status(200).json(members);
  } catch (error) {
    res.status(500).json({ msg: 'Ups, something went wrong 😕' });
  }
}
