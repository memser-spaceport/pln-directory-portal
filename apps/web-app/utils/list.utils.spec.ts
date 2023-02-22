import { stringifyQueryValues } from './list.utils';

describe('#stringifyQueryValues', () => {
  it('should return a valid string with the values separated by a comma when provided strings with values separated by vertical bar', () => {
    expect(stringifyQueryValues('IPFS|Filecoin')).toEqual('IPFS,Filecoin');
  });

  it('should return a valid string with the values separated by a comma when provided an array of strings', () => {
    expect(stringifyQueryValues(['IPFS', 'Filecoin'])).toEqual('IPFS,Filecoin');
  });
});
