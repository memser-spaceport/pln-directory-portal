export const formatIrlEventDate = (startDate, endDate) => {
  const startDateTime = new Date(startDate);
  const endDateTime = new Date(endDate);

  const startMonth = startDateTime.toLocaleString('default', {
    month: 'short',
  });
  const startDay = startDateTime.getDate();
  const startYear = startDateTime.getFullYear();

  const endMonth = endDateTime.toLocaleString('default', { month: 'short' });
  const endDay = endDateTime.getDate();
  const endYear = endDateTime.getFullYear();

  let formattedDateRange = '';

  if (startMonth === endMonth && startYear === endYear) {
    formattedDateRange = `${startMonth} ${startDay}-${endDay}, ${startYear}`;
  } else if (startYear === endYear) {
    formattedDateRange = `${startMonth} ${startDay}-${endMonth} ${endDay}, ${startYear}`;
  } else {
    formattedDateRange = `${startMonth} ${startDay}, ${startYear}-${endMonth} ${endDay}, ${endYear}`;
  }
  return formattedDateRange;
};
