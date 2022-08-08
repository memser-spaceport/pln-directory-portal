import { Switch } from '@protocol-labs-network/ui';
import { useSwitchFilter } from '../../../../../hooks/directory/use-switch-filter.hook';

export function OfficeHoursFilter() {
  const { enabled, onSetEnabled } = useSwitchFilter('officeHoursOnly');

  return (
    <Switch
      label="Only show Members with Office Hours"
      initialValue={enabled}
      onChange={onSetEnabled}
    />
  );
}
