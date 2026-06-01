import { TeamsMenu } from './components/TeamsMenu/TeamsMenu';
import { MembersV2Menu } from './components/MembersV2Menu/MembersV2Menu';
import { DemoDaysMenu } from './components/DemoDaysMenu/DemoDaysMenu';
import { useAuth } from '../../context/auth-context';
import { IrlGatheringMenu } from './components/IrlGatheringMenu/IrlGatheringMenu';
import { DealsMenu } from './components/DealsMenu/DealsMenu';
import { FounderGuidesMenu } from './components/FounderGuidesMenu/FounderGuidesMenu';

export function Menu() {
  const { isDirectoryAdmin, canViewDemoDays, hasPermission } = useAuth();

  return (
    <ul className="flex space-x-4 text-sm text-gray-700">
      {isDirectoryAdmin && <MembersV2Menu />}
      {(isDirectoryAdmin ||
        hasPermission('team.membership_source.read') ||
        hasPermission('membership.source.read')) && <TeamsMenu />}
      {canViewDemoDays && <DemoDaysMenu />}
      {isDirectoryAdmin && <IrlGatheringMenu />}
      {isDirectoryAdmin && <DealsMenu />}
      {isDirectoryAdmin && <FounderGuidesMenu />}
    </ul>
  );
}
