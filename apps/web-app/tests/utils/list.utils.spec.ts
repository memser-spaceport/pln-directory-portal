import { getListRequestOptionsFromQuery } from '../../utils/api/list.utils';

describe('#getListRequestOptionsFromQuery', () => {
  it('should return valid options when sort is provided and is valid', () => {
    expect(getListRequestOptionsFromQuery({ sort: 'Name,desc' })).toEqual({
      sort: { field: 'Name', direction: 'desc' },
    });
  });

  it('should return valid options when sort is provided and is invalid', () => {
    expect(getListRequestOptionsFromQuery({ sort: 'invalid' })).toEqual({
      sort: { field: 'Name', direction: 'asc' },
    });
  });

  it('should return valid options when sort is not provided', () => {
    expect(getListRequestOptionsFromQuery({})).toEqual({
      sort: { field: 'Name', direction: 'asc' },
    });
  });
});
