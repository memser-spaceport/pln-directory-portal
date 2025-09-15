import { TeamsMenu } from './components/TeamsMenu/TeamsMenu';
import { MembersMenu } from './components/MembersMenu/MembersMenu';
import { RecommendationsMenu } from './components/RecommendationsMenu/RecommendationsMenu';
import { DemoDaysMenu } from './components/DemoDaysMenu/DemoDaysMenu';

export function Menu() {
  return (
    <ul className="flex space-x-4 text-sm text-gray-700">
      <MembersMenu />
      <TeamsMenu />
      <RecommendationsMenu />
      <DemoDaysMenu />
    </ul>
  );
}
