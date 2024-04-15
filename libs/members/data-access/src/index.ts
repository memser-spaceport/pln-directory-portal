import { TMemberResponse } from '@protocol-labs-network/contracts';
import {
  client,
  TGetRequestOptions,
} from '@protocol-labs-network/shared/data-access';
import { TMemberListOptions, TMembersFiltersValues, TMembersRoleFilterValues } from './members.types';

/**
 * Get members list from API
 */
export const getMembers = async (options: TMemberListOptions) => {
  return await client.members.getMembers({
    query: {
      ...options,
    } as any,
  });
};

/**
 * Get member details from API
 */
export const getMember = async (
  id: string,
  options: TGetRequestOptions = {}
) => {
  return await client.members.getMember({
    params: { uid: id },
    query: options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
};

/**
 * Get member prefernce details from API
 */
export const getMemberPreferences = async (
  id: string,
  token :string
) => {
  return await client.members.getMemberPreferences({
    params: { uid: id },
    headers:{
      Authorization:`Bearer ${JSON.parse(token)}`
    }
  } as any);
};

/**
 * Get member unique id based on provided airtable id
 */
export const getMemberUIDByAirtableId = async (id: string) => {
  const res = await client.members.getMembers({
    query: { airtableRecId: id, select: 'uid' } as any,
  });

  return res.status === 200 && res.body[0] ? res.body[0].uid : null;
};


/**
 * Get members roles from API
 */
export const getMemberRoleValues = async (options: TMemberListOptions) => {
  return await client.members.getMemberRoles({
    query: {
      ...options,
    } as any,
  });
};

/**
 * Get member roles values
 */
export const getMemberRoles = async (options: TMemberListOptions) => {
  const valuesByFilter = await getMemberRoleValues(options);
  if (valuesByFilter.status !== 200) {
    return [];
  }
  return valuesByFilter.body as TMembersRoleFilterValues[];
};

/**
 * Get values and available values for members filters
 */
export const getMembersFilters = async (options: TMemberListOptions) => {
  const [valuesByFilter, availableValuesByFilter] = await Promise.all([
    getMembersFiltersValues({
      plnFriend: false,
    }),
    getMembersFiltersValues(options),
  ]);

  if (valuesByFilter.status !== 200 || availableValuesByFilter.status !== 200) {
    const emptyFilters = {
      skills: [],
      region: [],
      country: [],
      metroArea: [],
    };

    return {
      valuesByFilter: emptyFilters,
      availableValuesByFilter: emptyFilters,
    };
  }

  return {
    valuesByFilter: parseMembersFilters(valuesByFilter.body),
    availableValuesByFilter: parseMembersFilters(availableValuesByFilter.body),
  };
};

/**
 * Get values for teams filters
 */
const getMembersFiltersValues = async (options: TMemberListOptions = {}) => {
  return await getMembers({
    ...options,
    pagination: false,
    select:
      'skills.title,location.metroArea,location.city,location.continent,location.country',
  });
};

/**
 * Parse members fields values into lists of unique values per field.
 */
const parseMembersFilters = (members: TMemberResponse[]) => {
  const filtersValues = members.reduce(
    (values, member) => {
      const skills = getUniqueFilterValues(
        values.skills,
        member.skills?.map((skill) => skill.title)
      );

      const region = getUniqueFilterValues(
        values.region,
        member.location?.continent ? [member.location.continent] : []
      );

      const country = getUniqueFilterValues(
        values.country,
        member.location?.country ? [member.location.country] : []
      );

      const metroArea = getUniqueFilterValues(
        values.metroArea,
        member.location?.metroArea ? [member.location.metroArea] : []
      );

      return { skills, region, country, metroArea };
    },
    {
      skills: [],
      region: [],
      country: [],
      metroArea: [],
    } as TMembersFiltersValues
  );

  Object.values(filtersValues).forEach((value) => value.sort());

  return filtersValues;
};

/**
 * Get unique values from two arrays
 */
const getUniqueFilterValues = (
  uniqueValues: string[],
  newValues?: string[]
): string[] => {
  return [...new Set([...uniqueValues, ...(newValues || [])])];
};

export * from './members.types';
