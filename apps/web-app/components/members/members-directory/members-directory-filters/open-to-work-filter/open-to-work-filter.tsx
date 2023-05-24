import { Switch } from '@protocol-labs-network/ui';
import { useSwitchFilter } from '../../../../../hooks/directory/use-switch-filter.hook';

export function OpenToWorkFilter() {
  const { enabled, onSetEnabled } = useSwitchFilter('openToWork');

  return (
    <Switch
      label="Open to work"
      initialValue={enabled}
      onChange={onSetEnabled}
    />
  );
}
