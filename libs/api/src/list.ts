export interface IListOptions {
  sort?: IListSort[];
  filterByFormula?: string;
  fields?: string[];
}

interface IListSort {
  field: string;
  direction: 'asc' | 'desc';
}
