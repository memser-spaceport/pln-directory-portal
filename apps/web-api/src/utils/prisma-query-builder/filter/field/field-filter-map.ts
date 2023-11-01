import set from 'lodash/set';
import { LookupFilter } from './lookup.enum';

interface BuildQueryFunction {
  build: (params: {
    prop: string;
    value: string;
    nullable?: boolean;
    boolean?: boolean;
    numeric?: boolean;
    fromMany?: boolean;
    hasMany?: boolean;
    isRelational?: boolean;
  }) => Record<string, any>;
}

export const LOOKUP_FILTER_MAP: Map<LookupFilter, BuildQueryFunction> = new Map(
  [
    [
      LookupFilter.EXACT,
      {
        build: ({
          prop,
          value,
          nullable,
          numeric,
          boolean,
          fromMany,
          hasMany,
          isRelational,
        }) => {
          const prismaQueryPath =
            !fromMany && !hasMany
              ? prop
              : prop
                  .replace(/\./g, '.some.')
                  .replace(
                    /(?<last>\.some\..*)(\.some\.)(?<field>\w+)$/,
                    '$1.is.$3'
                  );
          const prismaQueryValue = [
            {
              is: +value,
              when: numeric && !isNaN(+value),
            },
            {
              is: value === 'true',
              when: boolean,
            },
            {
              is: { none: {} },
              when: value === 'null' && hasMany && !fromMany,
            },
            {
              is: null,
              when: value === 'null' && (isRelational || nullable) && !hasMany,
            },
            {
              is: value,
              when: !isRelational,
            },
          ].find((condition) => !!condition.when)?.is;

          return set({}, prismaQueryPath, prismaQueryValue);
        },
      },
    ],
    [
      LookupFilter.CONTAINS,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            contains: value,
          }),
      },
    ],
    [
      LookupFilter.STARTS_WITH,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            startsWith: value,
          }),
      },
    ],
    [
      LookupFilter.ENDS_WITH,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            endsWith: value,
          }),
      },
    ],
    [
      LookupFilter.ICONTAINS,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            contains: value,
            mode: 'insensitive',
          }),
      },
    ],
    [
      LookupFilter.ISTARTS_WITH,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            startsWith: value,
            mode: 'insensitive',
          }),
      },
    ],
    [
      LookupFilter.IENDS_WITH,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            endsWith: value,
            mode: 'insensitive',
          }),
      },
    ],
    [
      LookupFilter.LT,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            lt: !isNaN(+value) ? +value : value,
          }),
      },
    ],
    [
      LookupFilter.LTE,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            lte: !isNaN(+value) ? +value : value,
          }),
      },
    ],
    [
      LookupFilter.GT,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            gt: !isNaN(+value) ? +value : value,
          }),
      },
    ],
    [
      LookupFilter.GTE,
      {
        build: ({ prop, value, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            gte: !isNaN(+value) ? +value : value,
          }),
      },
    ],
    [
      LookupFilter.IN,
      {
        build: ({ prop, value, numeric, fromMany }) =>
          set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
            has: numeric
              ? value.split(',').map((val) => +val)
              : value.split(','),
          }),
      },
    ],
    [
      LookupFilter.WITH,
      {
        build: ({ prop, value, numeric, fromMany }) => ({
          AND: value
            .split(',')
            .map((val) =>
              set(
                {},
                !fromMany ? prop : prop.replace(/\./g, '.some.'),
                numeric ? +val : val
              )
            ),
        }),
      },
    ],
    [
      LookupFilter.BETWEEN,
      {
        build: ({ prop, value, fromMany }) => {
          const rangeValues = value.split(',').sort();
          const lowestValue = !isNaN(+rangeValues[0])
            ? +rangeValues[0]
            : rangeValues[0];
          const highestValue = !isNaN(+rangeValues[1])
            ? +rangeValues[1]
            : rangeValues[1];
          return !!rangeValues.length
            ? set({}, !fromMany ? prop : prop.replace(/\./g, '.some.'), {
                gte: lowestValue,
                lte: highestValue,
              })
            : {};
        },
      },
    ],
  ]
);
