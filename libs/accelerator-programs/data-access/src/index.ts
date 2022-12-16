import { client } from '@protocol-labs-network/shared/data-access';

export const getAcceleratorPrograms = async () => {
  return await client.acceleratorPrograms.getAcceleratorPrograms();
};
