export const formatIrlEventDate = (startDate, endDate) => {
  const startDateTime = new Date(startDate);
  const endDateTime = new Date(endDate);

  const startMonth = startDateTime.toLocaleString('default', {
    month: 'short',
    timeZone: 'UTC',
  });
  const startDay = startDateTime.getUTCDate();
  const startYear = startDateTime.getUTCFullYear();

  const endMonth = endDateTime.toLocaleString('default', {
    month: 'short',
    timeZone: 'UTC',
  });
  const endDay = endDateTime.getUTCDate();
  const endYear = endDateTime.getUTCFullYear();

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

export const isPastDate = (date) => {
  const currentDate = new Date();
  return new Date(date)?.getTime() < currentDate.getTime();
};
