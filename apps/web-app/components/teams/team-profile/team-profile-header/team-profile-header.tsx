import { UserGroupIcon } from '@heroicons/react/solid';
import { ITeam } from '@protocol-labs-network/api';
import { Tooltip } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { TagsGroup } from '../../../shared/tags-group/tags-group';
import { ProtocolBtn } from './protocol-btn';
import { ReactComponent as FilecoinIcon } from '/public/assets/images/icons/filecoin-logo.svg';
import { ReactComponent as IPFSIcon } from '/public/assets/images/icons/ipfs-logo.svg';

export function TeamProfileHeader({
  logo,
  name,
  tags,
  filecoinUser,
  ipfsUser,
}: ITeam) {
  return (
    <div className="flex space-x-4">
      <div
        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 ${
          logo ? 'bg-white' : 'bg-slate-200'
        }`}
      >
        {logo ? (
          <Image
            className="rounded"
            alt={`${name} Logo`}
            src={logo}
            layout="fill"
            objectFit="contain"
            objectPosition="center"
          />
        ) : (
          <UserGroupIcon className="w-22 h-22 mt-2 fill-white" />
        )}
      </div>
      <div className="grow space-y-4">
        <h1 className="text-2xl font-bold">{name}</h1>
        <div>
          {tags?.length ? (
            <TagsGroup items={tags} />
          ) : (
            <span className="text-xs leading-7 text-slate-400">-</span>
          )}
        </div>
      </div>
      <div className="flex w-24 items-start justify-end">
        {filecoinUser ? (
          <Tooltip
            triggerClassName="on-focus focus-within:rounded-full focus:rounded-full focus-visible:rounded-full"
            trigger={<ProtocolBtn Icon={FilecoinIcon} />}
            content="Filecoin User"
          />
        ) : null}
        {ipfsUser ? (
          <Tooltip
            trigger={<ProtocolBtn Icon={IPFSIcon} />}
            triggerClassName="ml-4 on-focus focus-within:rounded-full focus:rounded-full focus-visible:rounded-full"
            content="IPFS User"
          />
        ) : null}
      </div>
    </div>
  );
}
