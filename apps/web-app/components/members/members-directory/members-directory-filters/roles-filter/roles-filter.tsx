import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { useTagsFilter } from 'apps/web-app/components/shared/directory/directory-filters/directory-tags-filter/use-tags-filter.hook';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';

export interface RolesFilterProps {
  memberRoles: IFilterTag[];
}

export function RolesFilter({ memberRoles }: RolesFilterProps) {
  const [tags, toggleTag] = useTagsFilter('memberRoles', memberRoles);
  const analytics = useAppAnalytics();

  const onToggleTag = (role: IFilterTag, index: number) => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.FILTERS_APPLIED, {
      page: 'Members',
      name: 'Roles',
      value: role.label,
      nameAndValue: `Roles-${role.label}`,
    });
    toggleTag(index);
  };

  return (
    <div>
      <p className="mb-4 text-sm font-semibold leading-5">Roles</p>
      <div className="flex flex-col gap-2">
        {tags.map((item, index) => (
          <label key={item.value} className="checkbox flex items-center">
            <input
              type="checkbox"
              checked={item.selected}
              onChange={() => onToggleTag(item, index)}
            />
            <span className="ml-2 text-[12px] font-[500] leading-[14px] text-[#0F172A]">
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
