export interface IListOptions {
  sort: IListSort[];
  filterByFormula: string;
}

interface IListSort {
  field: string;
  direction: 'asc' | 'desc';
}
