import { Switch, Tooltip } from '@protocol-labs-network/ui';
import { useSwitchFilter } from '../../../../../hooks/directory/use-switch-filter.hook';
import { ReactComponent as InformationCircleIcon } from '../../../../../public/assets/images/icons/info_icon.svg';
import { ReactComponent as NewBanner } from '../../../../../public/assets/images/icons/new-banner.svg';
import { ReactComponent as CardBadge } from '../../../../../public/assets/images/icons/collaborate_card.svg';

export function OpenToWorkFilter() {
  const { enabled, onSetEnabled } = useSwitchFilter('openToWork');
  const hintContent = (
    <div className="font-normal leading-5 text-sm p-3.5">
      <span>
        Members with this icon
        <CardBadge className="mx-1 inline-block" />
        are open to collaborate on shared ideas & projects with other members.
      </span>
    </div>
  );

  return (
    <>
      {/* <div className="relative left-[-31px]">
        <NewBanner className="absolute" />
      </div> */}
      <div className="flex justify-between">
        <div className="flex gap-1">
          <span className="select-none text-sm text-slate-600">
            Open to Collaborate
          </span>
          <Tooltip
            asChild
            trigger={<InformationCircleIcon className="mt-0.5" />}
            content={hintContent}
          />
        </div>
        {/* {hintContent} */}

        <Switch
          // label="Open to Collaborate"
          initialValue={enabled}
          onChange={onSetEnabled}
        />
      </div>
    </>
  );
}
