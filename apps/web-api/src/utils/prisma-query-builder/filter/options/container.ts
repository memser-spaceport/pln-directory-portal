import { DistinctOption } from './distinct-option';
import { FilterOption } from './filter-option';
import { OrderChildrenOption } from './order-children-option';
import { OrderOption } from './order-option';
import { PaginationOption } from './pagination-option';
import { RelationsOption } from './relations-option';
import { SelectOption } from './select-option';

export class OptionsCollection {
  public readonly options: FilterOption[];

  constructor() {
    this.options = [
      new PaginationOption(),
      new SelectOption(),
      new RelationsOption(),
      new OrderOption(),
      new OrderChildrenOption(),
      new DistinctOption(),
    ];
  }
}
