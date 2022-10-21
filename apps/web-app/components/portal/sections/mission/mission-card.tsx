import { ReactComponent as AdoptionIcon } from '../../../../public/assets/images/icons/adoption-icon.svg';
import { ReactComponent as BuildingIcon } from '../../../../public/assets/images/icons/building-icon.svg';
import { ReactComponent as FundingIcon } from '../../../../public/assets/images/icons/funding-icon.svg';
import { ReactComponent as NetworkingIcon } from '../../../../public/assets/images/icons/networking-icon.svg';
import { ReactComponent as ResearchIcon } from '../../../../public/assets/images/icons/research-icon.svg';
import { ReactComponent as TalentIcon } from '../../../../public/assets/images/icons/talent-icon.svg';
import { Card } from '../../card/card';
import { MissionHelpArea } from './mission-help-area';

const helpAreas = [
  { icon: <BuildingIcon />, name: 'Initial Building' },
  { icon: <NetworkingIcon />, name: 'Networking' },
  { icon: <TalentIcon />, name: 'Talent' },
  { icon: <ResearchIcon />, name: 'Research and Engineering' },
  { icon: <FundingIcon />, name: 'Funding' },
  { icon: <AdoptionIcon />, name: 'Adoption' },
];

export const MissionCard = () => {
  return (
    <Card styleClassName="bg-white px-9">
      <h2 className="md:text-lg">
        Teams in the Protocol Labs Network (PLN) receive support across the
        entire research and development pipeline. PLN teams get help on:
      </h2>
      <div className="mt-8 grid gap-y-6 gap-x-10 font-medium md:mt-7 md:grid-flow-col md:grid-cols-2 md:grid-rows-3 md:text-lg xl:grid-cols-3 xl:grid-rows-2">
        {helpAreas.map((area, i) => (
          <MissionHelpArea key={i} areaIcon={area.icon} areaName={area.name} />
        ))}
      </div>
    </Card>
  );
};
