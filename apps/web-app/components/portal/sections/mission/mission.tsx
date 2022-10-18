import { MissionCard } from './mission-card';
import { MissionContainer } from './mission-container';

export const Mission = () => {
  return (
    <MissionContainer>
      <div className="relative z-10 mx-auto max-w-[1110px]">
        <h1 className="mb-14 text-4xl font-extrabold leading-[46px] sm:text-5xl sm:leading-[60px]">
          The Protocol Labs Network drives{' '}
          <span className="text-blue-600">breakthroughs in computing</span> to
          push humanity forward.
        </h1>
      </div>
      <div className="relative z-10 flex flex-col text-center sm:mb-[152px]">
        <MissionCard />
      </div>
    </MissionContainer>
  );
};
