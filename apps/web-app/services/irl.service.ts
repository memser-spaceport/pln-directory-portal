import api from '../utils/api';

export const getEventDetailBySlug = async (slug, token) => {
  let result;
  try {
    result = await api.get(
      `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events/${slug}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );  
  } catch (e) {
    if(e.response.status) {
      return {
        errorCode: 404
      }
    } else {
      return {
        errorCode: 500
      }
    }
   
  }

  const output = result.data;
  

  return {
    id: output.uid,
    name: output.name,
    slugUrl: output.slugURL,
    bannerUrl: output.banner.url,
    eventCount: output.eventsCount,
    description: output.description,
    websiteUrl: output.websiteURL,
    telegram:output.telegramId,
    guests: output.eventGuests?.map((guest: any) => {
      return {
        uid: guest.uid,
        teamUid: guest?.teamUid,
        teamName: guest?.team.name,
        teamLogo: guest?.team.logo?.url,
        memberUid: guest?.memberUid,
        memberName: guest?.member?.name,
        memberLogo: guest?.member?.image?.url,
        reason: guest?.reason,
        telegramId: guest?.telegramId,
      };
    }),
  };
};

export const createEventGuest = async (slug, payload) => {
  const result = await api.post(
    `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events/${slug}/guest`,
    payload
  );

  return result;
};

export const editEventGuest = async (slug, uid, payload) => {
  const result = await api.put(
    `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events/${slug}/guest/${uid}`,
    payload
  );

  return result;
};
