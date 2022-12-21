import { ConfigProfile } from '../config-profile';
import { ITEMS_PER_PAGE } from '../default-config';

export const ENABLED_PROFILE: ConfigProfile = {
  options: {
    pagination: {
      status: 'enabled',
      paginate: true,
      itemsPerPage: ITEMS_PER_PAGE,
    },
    ordering: {
      status: 'enabled',
    },
    orderingChildren: {
      status: 'enabled',
    },
    relations: {
      status: 'enabled',
    },
    select: {
      status: 'enabled',
    },
    distinct: {
      status: 'enabled',
    },
  },
  policy: 'skip',
};

export const ENABLED_RETRIEVAL_PROFILE: ConfigProfile = {
  options: {
    pagination: {
      status: 'disabled',
      paginate: false,
      itemsPerPage: ITEMS_PER_PAGE,
    },
    ordering: {
      status: 'disabled',
    },
    orderingChildren: {
      status: 'enabled',
    },
    relations: {
      status: 'enabled',
    },
    select: {
      status: 'enabled',
    },
    distinct: {
      status: 'enabled',
    },
  },
  policy: 'skip',
};
