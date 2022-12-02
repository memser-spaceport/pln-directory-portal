import { client } from '@protocol-labs-network/shared/data-access';

export const getAcceleratorPrograms = async () => {
  const { body, status } =
    await client.acceleratorPrograms.getAcceleratorPrograms({
      query: {},
    });

  return { body, status };
};
