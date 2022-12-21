import { EnableableOption } from './enableable-option';
import { PaginationOption } from './pagination-option';

export interface ProfileOptions {
  ordering: EnableableOption;
  orderingChildren: EnableableOption;
  pagination: PaginationOption;
  relations: EnableableOption;
  select: EnableableOption;
  distinct: EnableableOption;
}
