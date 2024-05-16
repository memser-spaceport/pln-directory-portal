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

export const sortByDefault = (guests) => {
  const guestsWithReasonAndTelegram = [];
  const guestsWithReason = [];
  const guestsWithTelegram = [];
  const remaining = [];

  guests?.forEach((guest) => {
    if (guest?.reason?.trim() && guest?.telegramId) {
      guestsWithReasonAndTelegram.push(guest);
    } else if (guest?.reason?.trim() && !guest?.telegramId) {
      guestsWithReason.push(guest);
    } else if (!guest?.reason?.trim() && guest?.telegramId) {
      guestsWithTelegram.push(guest);
    } else {
      remaining.push(guest);
    }
  });

  guestsWithReasonAndTelegram?.sort((a, b) =>
    a.memberName?.localeCompare(b?.memberName)
  );
  guestsWithReason?.sort((a, b) => a.memberName?.localeCompare(b?.memberName));
  guestsWithTelegram?.sort((a, b) =>
    a.memberName?.localeCompare(b?.memberName)
  );
  remaining?.sort((a, b) => a.memberName?.localeCompare(b?.memberName));

  const combinedList = [
    ...guestsWithReasonAndTelegram,
    ...guestsWithReason,
    ...guestsWithTelegram,
    ...remaining,
  ];

  return combinedList;
};
