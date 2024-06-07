import { destroyCookie } from "nookies";

export function formatIrlEventDate(startDateStr, endDateStr, timeZone = 'America/Los_Angeles') {
  const options: unknown = { month: 'short', day: 'numeric', timeZone: timeZone };

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  const startFormatter = new Intl.DateTimeFormat('en-US', options);
  const startFormatted = startFormatter.format(startDate);

  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timeZone }).format(endDate);
  const endDay = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: timeZone }).format(endDate);
  const endYear = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: timeZone }).format(endDate);

  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timeZone }).format(startDate);

  let endFormatted;
  if (startMonth === endMonth) {
    endFormatted = endDay;
  } else {
    endFormatted = `${endMonth} ${endDay}`;
  }

  return `${startFormatted}-${endFormatted}, ${endYear}`;
}

export const isPastDate = (date) => {
  const currentDate = new Date();
  const inputDate = new Date(date);
  return inputDate.getTime() < currentDate.getTime();
};

export const sortByDefault = (guests) => {
  const guestsWithReasonAndTopics = [];
  const guestsWithReason = [];
  const guestsWithTopics = [];
  const remaining = [];

  guests?.forEach((guest) => {
    if (guest?.reason?.trim() && guest?.topics?.length > 0) {
      guestsWithReasonAndTopics.push(guest);
    } else if (guest?.reason?.trim() && guest?.topics?.length === 0) {
      guestsWithReason.push(guest);
    } else if (!guest?.reason?.trim() && guest?.topics?.length > 0) {
      guestsWithTopics.push(guest);
    } else {
      remaining.push(guest);
    }
  });

  guestsWithReasonAndTopics?.sort((a, b) => a.memberName?.localeCompare(b?.memberName));
  guestsWithReason?.sort((a, b) => a.memberName?.localeCompare(b?.memberName));
  guestsWithTopics?.sort((a, b) => a.memberName?.localeCompare(b?.memberName));
  remaining?.sort((a, b) => a.memberName?.localeCompare(b?.memberName));

  const combinedList = [...guestsWithReasonAndTopics, ...guestsWithTopics, ...guestsWithReason, ...remaining];

  return combinedList;
};

export const removeCookieInserverSide = (ctx) => {
  destroyCookie(ctx, 'authToken', {
    path: '/',
    domain: process.env.COOKIE_DOMAIN || ''
  });

  destroyCookie(ctx, 'refreshToken', {
    path: '/',
    domain: process.env.COOKIE_DOMAIN || ''
  });

  destroyCookie(ctx, 'userInfo', {
    path: '/',
    domain: process.env.COOKIE_DOMAIN || ''
  });

  destroyCookie(ctx, 'idToken', {
    path: '/',
    domain: process.env.COOKIE_DOMAIN || ''
  });
}
export const getUniqueRoles = (guests: any) => {
  try {
    const allRoles = guests?.map((guest: any) => guest?.memberRole);
    const filteredRoles = allRoles.filter((role) => role && role.trim() !== '');
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
  const getOrdinalSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

    const getMonthName = (monthNumber) => {
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      return monthNames[monthNumber - 1];
    };

  const formatDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const dayWithSuffix = day + getOrdinalSuffix(day);
    const monthName = getMonthName(month);
    return `${dayWithSuffix} ${monthName}`;
  };

  export const formatDateRange = (startDate, endDate) => {
    if (!startDate && !endDate) {
          return '';
        }
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    if (startDate === endDate) {
      return formatDate(startDate);
    } else if (startMonth === endMonth && startYear === endYear) {
      const startDayWithSuffix = startDay + getOrdinalSuffix(startDay);
      const endDayWithSuffix = endDay + getOrdinalSuffix(endDay);
      const monthName = getMonthName(startMonth);
      return `${startDayWithSuffix} - ${endDayWithSuffix} ${monthName}`;
    } else {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }
  };

export function formatDateRangeForDescription(startDateStr, endDateStr, timeZone = 'America/Los_Angeles') {
  const options: unknown = { month: 'short', day: 'numeric', timeZone: timeZone };
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  const startFormatter = new Intl.DateTimeFormat('en-US', options);
  const endFormatter = new Intl.DateTimeFormat('en-US', options);

  const startFormatted = startFormatter.format(startDate);
  const endFormatted = endFormatter.format(endDate);

  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timeZone }).format(startDate);
  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timeZone }).format(endDate);

  const startDay = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: timeZone }).format(startDate);
  const endDay = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: timeZone }).format(endDate);

  const endYear = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: timeZone }).format(endDate);

  const startDayWithSuffix = getDayWithSuffix(startDay);
  const endDayWithSuffix = getDayWithSuffix(endDay);

  // Format the final string with month and day suffixes
  const startFormattedWithSuffix = `${startMonth} ${startDayWithSuffix}`;
  const endFormattedWithSuffix = `${endMonth} ${endDayWithSuffix}`;

  return `${startFormattedWithSuffix} - ${endFormattedWithSuffix}, ${endYear}`;
}

export function getArrivalDepartureDateRange(startDate, endDate, interval) {
  const newStartDate = new Date(startDate);
  const newEndDate = new Date(endDate);
  const dateFrom = new Date(newStartDate.getTime() - interval * 24 * 60 * 60 * 1000)?.toISOString();
  const dateTo = new Date(newEndDate.getTime() + interval * 24 * 60 * 60 * 1000)?.toISOString();
  return {
    dateFrom: dateFrom.split('T')[0],
    dateTo: dateTo.split('T')[0],
  };
}

export function formatDateToISO(dateStr, timeZone = 'America/Los_Angeles') {
  const date = new Date(dateStr);

  const options = { timeZone: timeZone };
  const yearFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', ...options });
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: '2-digit', ...options });
  const dayFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit', ...options });

  const year = yearFormatter.format(date);
  const month = monthFormatter.format(date);
  const day = dayFormatter.format(date);
  return `${year}-${month}-${day}`;
}
