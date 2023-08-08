import { GetServerSideProps } from 'next';
import { ReactElement } from 'react';
import { PortalDivider } from '../components/portal/portal-divider/portal-divider';
import { Directory } from '../components/portal/sections/directory/directory';
import { Faq } from '../components/portal/sections/faq/faq';
import { Footer } from '../components/portal/sections/footer/footer';
import { LabWeek } from '../components/portal/sections/labweek/labweek';
import { Mission } from '../components/portal/sections/mission/mission';
import { Projects } from '../components/portal/sections/projects/projects';
import { Substack } from '../components/portal/sections/substack/substack';
import { PortalLayout } from '../layouts/portal-layout';
import api from '../utils/api';
import { ANNOUNCEMENT_S3_URL, NW_SPOTLIGHT_CONSTANTS } from '../constants';

export default function Index({videoDetails,playlistDetails}) {
  return (
    <div>
      <Mission videoDetails={videoDetails} playlistDetails={playlistDetails} />
      <PortalDivider />
      <div className="bg-white px-6 py-24 md:px-16 md:py-[120px]">
        <div className="mx-auto max-w-[1110px]">
          <Directory />
        </div>
      </div>
      <div className="bg-gradient-to-b from-slate-50 to-white">
        <div className="px-6 py-24 md:px-16 ">
          <div className="mx-auto max-w-[1110px]">
            <div className="mb-[106px] md:mb-[162px]">
              <LabWeek />
            </div>
            <div className="mb-[72px] md:mb-40">
              <Projects />
            </div>
            <div className="mb-32 md:mb-48">
              <Substack />
            </div>
            <div className="mx-auto max-w-[800px]">
              <Faq />
            </div>
          </div>
        </div>
        <PortalDivider />
        <Footer />
      </div>
    </div>
  );
}

Index.getLayout = function getLayout(page: ReactElement) {
  return <PortalLayout bannerJSON={page?.props?.children[1]?.props?.bannerJSON}>{page}</PortalLayout>;
};

const getVideoDetails = async () => {
  try {
    const videoDetails = await api.get(NW_SPOTLIGHT_CONSTANTS.VIDEO_URL);
    if (videoDetails.status === 200) {
      return videoDetails.data;
    } else {
      return null;
    }
  } catch (err) {
    return null;
  }
}

const getPlaylistVideoDetails = async () => {
  try {
    const playlistDetails = await api.get(NW_SPOTLIGHT_CONSTANTS.PLAYLIST_URL);
    if (playlistDetails.status === 200) {
      return playlistDetails.data;
    } else {
      return null;
    }
  } catch (err) {
    return null;
  }
}

export const getServerSideProps: GetServerSideProps = async () => {
  let [videoDetails, playlistDetails] = await Promise.all([getVideoDetails(), getPlaylistVideoDetails()]);
  let bannerJSON = null;
  
  try{
    const bannerResponse = await fetch(ANNOUNCEMENT_S3_URL, {
      headers: {
        Authorization: process.env.NEXT_PUBLIC_ANNOUNCEMENT_S3_AUTH_TOKEN,
      },
    });
  
    if(bannerResponse.status === 200){
      const responseJson = await bannerResponse.json();
    
      if (responseJson && responseJson?.message && responseJson.message.length) {
        bannerJSON = responseJson;
      }
    }
    
  }catch(err){
    console.log(err);
    
  }
  
 
  return process.env.NEXT_PUBLIC_HIDE_NETWORK_PORTAL
    ? {
        redirect: {
          permanent: false,
          destination: '/directory/teams',
        },
      }
    : { props: { videoDetails , playlistDetails , bannerJSON} };
};
