import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function getLabberHandler(
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
    const labber = await airtableService.getLabber(id);
    res.status(200).json(labber);
  } catch (error) {
    res.status(500).json({ msg: 'Ups, something went wrong 😕' });
  }
}
