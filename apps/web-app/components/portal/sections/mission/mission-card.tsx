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
  { icon: <ResearchIcon />, name: 'Research & Engineering' },
  { icon: <TalentIcon />, name: 'Talent' },
];

export const MissionCard = () => {
  return (
    <div className="mt-8 flex font-medium md:mt-7 md:text-lg justify-between flex-wrap">
      {helpAreas.map((area, i) => (
        <MissionHelpArea key={i} areaIcon={area.icon} areaName={area.name} index={i}/>
      ))}
    </div>
  );
};
