import { UserGroupIcon } from '@heroicons/react/solid';
import { ITeam } from '@protocol-labs-network/api';
import { Tooltip } from '@protocol-labs-network/ui';
import Image from 'next/image';
import { TagsGroup } from '../../../shared/tags-group/tags-group';
import { ReactComponent as FilecoinIcon } from '/public/assets/images/icons/filecoin-logo.svg';

export function TeamProfileHeader({
  logo,
  name,
  industryTags,
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
          {industryTags?.length ? (
            <TagsGroup items={industryTags.map((tag) => tag.title)} />
          ) : (
            <span className="text-xs leading-7 text-slate-400">-</span>
          )}
        </div>
      </div>
      <div className="flex w-24 items-start justify-end">
        {filecoinUser ? (
          <Tooltip
            asChild
            trigger={
              <div className="inline-flex h-10 w-10 rounded-full border border-slate-200 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.16)]">
                <FilecoinIcon className="h-6 w-6 self-center" />
              </div>
            }
            content="Filecoin User"
          />
        ) : null}
        {ipfsUser ? (
          <Tooltip
            asChild
            trigger={
              <div className="inline-flex h-10 w-10 rounded-full border border-slate-200 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.16)]">
                <Image
                  src="/assets/images/icons/ipfs-logo.png"
                  alt="IPFS Logo"
                  width="24px"
                  height="24px"
                />
              </div>
            }
            triggerClassName="ml-4"
            content="IPFS User"
          />
        ) : null}
      </div>
    </div>
  );
}
