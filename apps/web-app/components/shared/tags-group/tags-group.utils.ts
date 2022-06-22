export function parseStringsIntoTagsGroupItems(arr: string[]) {
  return arr.map((item) => ({ label: item }));
}
