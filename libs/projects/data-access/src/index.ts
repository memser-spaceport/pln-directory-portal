import { TGetRequestOptions, client } from '@protocol-labs-network/shared/data-access';

export const getAllProjects = async (options = {}) => {
  // return await client.projects.getProjects({query:{with:'team'}});
  return await client.projects.getProjects({
    query: options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
};

export const getProject =  async (uid) => {
  // return await client.projects.getProjects({query:{with:'team'}});
  return await client.projects.getProject({
    params: {uid},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
};
