import { TeamsMenu } from './components/TeamsMenu/TeamsMenu';
import { MembersMenu } from './components/MembersMenu/MembersMenu';
import { RecommendationsMenu } from './components/RecommendationsMenu/RecommendationsMenu';
import { DemoDaysMenu } from './components/DemoDaysMenu/DemoDaysMenu';
import { useAuth } from '../../context/auth-context';
import { RolesMenu } from './components/RolesMenu/RolesMenu';

export function Menu() {
  const { isDirectoryAdmin } = useAuth();

  return (
    <ul className="flex space-x-4 text-sm text-gray-700">
      {isDirectoryAdmin && <MembersMenu />}
      {isDirectoryAdmin && <RolesMenu />}
      {isDirectoryAdmin && <TeamsMenu />}
      {isDirectoryAdmin && <RecommendationsMenu />}
      <DemoDaysMenu />
    </ul>
  );
}
