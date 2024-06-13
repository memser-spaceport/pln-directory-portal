import { Switch } from '@protocol-labs-network/ui';
import { useSwitchFilter } from '../../../../../hooks/directory/use-switch-filter.hook';
import useAppAnalytics from '../../../../../hooks/shared/use-app-analytics';
import { APP_ANALYTICS_EVENTS } from '../../../../../constants';

export function OfficeHoursFilter() {
  const analytics = useAppAnalytics();
  const { enabled, onSetEnabled } = useSwitchFilter('officeHoursOnly');

  const onSwitchClicked = (value: boolean) => {
    onSetEnabled(value);
    if(value){
      analytics.captureEvent(APP_ANALYTICS_EVENTS.TEAM_OFFICE_HOURS_FILTER_SELECTED);
    }
  }

  return (
    <Switch
      label="Only Show Teams with Office Hours"
      initialValue={enabled}
      onChange={onSwitchClicked}
    />
  );
}
