export type TListSortDirection = 'asc' | 'desc';

export interface IListOptions {
  sort?: IListSort[];
  filterByFormula?: string;
  fields?: string[];
  pageSize?: number;
}

interface IListSort {
  field: string;
  direction: TListSortDirection;
}
