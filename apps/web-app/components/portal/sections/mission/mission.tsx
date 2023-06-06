import { NetworkSpotlight } from '../spotlight/network-spotlight';
import { MissionCard } from './mission-card';
import { MissionContainer } from './mission-container';

export const Mission = ({ videoDetails, playlistDetails }) => {
  return (
    <MissionContainer>
      <div className="relative z-10 mx-auto ">
        <h1 className="text-4xl font-extrabold leading-[46px] md:text-5xl md:leading-[60px]">
          The Protocol Labs Network drives{' '}
          <span className="text-blue-600">breakthroughs in computing</span> to
          push humanity forward.
        </h1>
        <h5 className='px-[125px] text-[18px] pt-2 pb-7'>Membership into the Protocol Labs Network (PLN) gets teams benefits to help them research, develop, and deploy these breakthroughs more quickly. Teams get help on:</h5>
      </div>
      <div className="relative z-10 flex flex-col text-center">
        <MissionCard />
        <NetworkSpotlight videoDetails={videoDetails} playlistDetails={playlistDetails} />
      </div>
    </MissionContainer>
  );
};
