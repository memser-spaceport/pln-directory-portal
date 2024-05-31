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
  const inputDate = new Date(date);
  currentDate.setHours(0, 0, 0, 0);
  inputDate.setHours(0, 0, 0, 0);

  return inputDate.getTime() < currentDate.getTime();
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

export const getUniqueRoles = (guests: any) => {
  try {
  const allRoles = guests?.map((guest: any) => guest?.memberRole);
  const filteredRoles = allRoles.filter((role) => role && role.trim() !== "")
  const uniqueRoles = Array.from(new Set([...filteredRoles]));
  return uniqueRoles;
  } catch (error) {
    return [];
  }
};

export const getTopics = (guests: any) => {
  const allTopics = guests?.reduce((acc: any[], guest: any) => {
    const topics = guest?.topics;
    if (topics) {
      return acc.concat(topics);
    }
    return acc;
  }, []);

  const uniqueTopics = Array.from(new Set([...allTopics]));

  return uniqueTopics;
};

function getDayWithSuffix(day) {
  if (day > 3 && day < 21) return day + 'th';
  switch (day % 10) {
    case 1:
      return day + 'st';
    case 2:
      return day + 'nd';
    case 3:
      return day + 'rd';
    default:
      return day + 'th';
  }
}

export function formatDateRange(date1, date2) {
  if (!date1 && !date2) {
    return '';
  }

  const startDate = new Date(date1);
  const endDate = new Date(date2);

  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const startMonth = startDate.toLocaleString('en-US', { month: 'long' });
  const endMonth = endDate.toLocaleString('en-US', { month: 'long' });

  const startDayWithSuffix = getDayWithSuffix(startDay);
  const endDayWithSuffix = getDayWithSuffix(endDay);

  if (startDate.getTime() === endDate.getTime()) {
    return `${startDayWithSuffix} ${startMonth}`;
  } else if (startMonth === endMonth) {
    return `${startDayWithSuffix}-${endDayWithSuffix} ${startMonth}`;
  } else {
    return `${startDayWithSuffix} ${startMonth}-${endDayWithSuffix} ${endMonth}`;
  }
}


export function formatDateRangeForDescription(date1, date2) {
  if (!date1 && !date2) {
    return '';
  }
  const startDate = new Date(date1);
  const endDate = new Date(date2);

  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const startMonth = startDate.toLocaleString('en-US', { month: 'long' });
  const endMonth = endDate.toLocaleString('en-US', { month: 'long' });

  const startDayWithSuffix = getDayWithSuffix(startDay);
  const endDayWithSuffix = getDayWithSuffix(endDay);

  if (startDate.getTime() === endDate.getTime()) {
    return `${startDayWithSuffix} ${startMonth}`;
  } else {
    return `${startMonth} ${startDayWithSuffix} - ${endMonth} ${endDayWithSuffix}`;
  }
}

export function getArrivalDepartureDateRange(startDate, endDate, interval) {
  const newStartDate = new Date(startDate);
  const newEndDate = new Date(endDate);
  const dateFrom = new Date(newStartDate.getTime() - interval * 24 * 60 * 60 * 1000)?.toISOString();
  const dateTo = new Date(newEndDate.getTime() + interval * 24 * 60 * 60 * 1000)?.toISOString();
  return {
    dateFrom:dateFrom.split('T')[0],
    dateTo: dateTo.split('T')[0],
  };
}
