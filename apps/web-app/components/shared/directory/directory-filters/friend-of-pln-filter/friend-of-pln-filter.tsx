import { Switch } from '@protocol-labs-network/ui';
import { useSwitchFilter } from '../../../../../hooks/directory/use-switch-filter.hook';

export function FriendOfPLNFilter() {
  const { enabled, onSetEnabled } = useSwitchFilter('includeFriends');

  return (
    <Switch
      label="Include Friends of Protocol Labs"
      initialValue={enabled}
      onChange={onSetEnabled}
    />
  );
}
