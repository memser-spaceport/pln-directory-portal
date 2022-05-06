import airtableService from '@protocol-labs-network/airtable';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function getLabbersHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`🚫 Method ${req.method} Not Allowed`);

    return;
  }

  try {
    const labbers = await airtableService.getLabbers();
    res.status(200).json(labbers);
  } catch (error) {
    res.status(500).json({ msg: 'Ups, something went wrong 😕' });
  }
}
