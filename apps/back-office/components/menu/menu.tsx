import { TeamsMenu } from './components/TeamsMenu/TeamsMenu';
import { MembersMenu } from './components/MembersMenu/MembersMenu';
import { DemoDaysMenu } from './components/DemoDaysMenu/DemoDaysMenu';
import { useAuth } from '../../context/auth-context';
import { RolesMenu } from './components/RolesMenu/RolesMenu';
import { AccessControlMenu } from './components/AccessControlMenu/AccessControlMenu';
import { IrlGatheringMenu } from './components/IrlGatheringMenu/IrlGatheringMenu';
import { DealsMenu } from './components/DealsMenu/DealsMenu';

export function Menu() {
  const { isDirectoryAdmin, isDemoDayAdmin } = useAuth();

  return (
    <ul className="flex space-x-4 text-sm text-gray-700">
      {isDirectoryAdmin && <MembersMenu />}
      {isDirectoryAdmin && <RolesMenu />}
      {isDirectoryAdmin && <AccessControlMenu />}
      {isDirectoryAdmin && <TeamsMenu />}
      {(isDirectoryAdmin || isDemoDayAdmin) && <DemoDaysMenu />}
      {isDirectoryAdmin && <IrlGatheringMenu />}
      {isDirectoryAdmin && <DealsMenu />}
    </ul>
  );
}
