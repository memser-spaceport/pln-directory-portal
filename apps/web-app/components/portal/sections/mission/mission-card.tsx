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
  { icon: <FundingIcon />, name: 'Funding' },
  { icon: <AdoptionIcon />, name: 'Adoption' },
  { icon: <TalentIcon />, name: 'Talent' },
  { icon: <ResearchIcon />, name: 'Research & Engineering' },
];

export const MissionCard = () => {
  return (
    <div className="mt-8 grid font-medium md:mt-7 md:grid-cols-6 md:text-lg xl:grid-cols-7 ">
      {helpAreas.map((area, i) => (
        <MissionHelpArea key={i} areaIcon={area.icon} areaName={area.name} index={i}/>
      ))}
    </div>
  );
};
