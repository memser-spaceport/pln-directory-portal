export interface IListOptions {
  sort: IListSort[];
}

interface IListSort {
  field: string;
  direction: 'asc' | 'desc';
}
