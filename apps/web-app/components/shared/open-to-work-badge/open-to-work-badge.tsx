import { Tooltip } from '@protocol-labs-network/ui';
import { ReactComponent as CardBadge } from '../../../public/assets/images/icons/collaborate_card.svg';
import { ReactComponent as ProfilePageBadge } from '../../../public/assets/images/icons/collaborate_profile.svg';

type IOpenToWorkBadgeProps = {
  type: 'CARD' | 'PROFILE';
};

export function OpenToWorkBadge({ type }: IOpenToWorkBadgeProps) {
  const badge = type === 'CARD' ? <CardBadge/> : <ProfilePageBadge />
  return (
    <>
      <Tooltip
        trigger={
          badge
        }
        triggerClassName="on-focus"
        content="Open To Collaborate"
      />
      <style>
        {`
          .on-focus:focus {
            outline: none;
            border: none;
            box-shadow: none;
          }
        `}
      </style>
    </>
  );
}
