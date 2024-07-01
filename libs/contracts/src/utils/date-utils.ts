export const compareDateWithoutTime = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  // Set the time to 00:00:00 for both dates
  d1.setUTCHours(0, 0, 0, 0);
  d2.setUTCHours(0, 0, 0, 0);
  return d1.getTime() - d2.getTime();
};
  
export const compareMonthYear = (date1: string, date2: string): number => {
  const [d1, d2] = [new Date(date1), new Date(date2)];
  // Set the time to 00:00:00 for both dates
  d1.setUTCHours(0, 0, 0, 0);
  d2.setUTCHours(0, 0, 0, 0);
  return (d1.getUTCFullYear() - d2.getUTCFullYear()) || (d1.getUTCMonth() - d2.getUTCMonth());
};