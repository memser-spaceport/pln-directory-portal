export const formatDateTime = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return formatter.format(date);
};

export const truncate = (str: string, max: number): string => {
  return str.length > max ? str.slice(0, max - 1).trimEnd() + '…' : str;
};
