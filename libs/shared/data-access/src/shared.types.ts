export type TGetRequestOptions = {
  select?: string;
  with?: string;
};

export type TListOptions = TGetRequestOptions & {
  orderBy?: string;
  name__istartswith?: string;
  pagination?: boolean;
};
