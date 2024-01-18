import { ContributorsContext } from 'apps/web-app/context/projects/contributors.context';
import Image from 'next/image';
import { useContext } from 'react';

export default function DefaultMemberUI({onContributorAddClick}) {
  const { contributorsState, contributorsDispatch } =
    useContext(ContributorsContext);

//   const onContributorAddClick = () => {
//     contributorsDispatch({
//       type: 'SET_CHOOSE_TEAM_POPUP',
//       payload: {
//         ...contributorsState.chooseTeamPopup,
//         showChooseTeamPopup: true,
//         chooseTeamPopupMode: 'EDIT',
//         UIType: 'MEMBER',
//         chooseTeamPopupTitle: 'Select Contributors',
//       },
//     });
//   };

  return (
    <>
      <div className="flex items-center justify-between px-[20px] py-[20px]">
        <div className="text-sm font-normal not-italic leading-5 text-[#64748B]">
          No contributors added
        </div>
        <div className="flex gap-2">
          <div
            className="cursor-pointer text-sm font-medium not-italic leading-6 text-[#156FF7]"
            onClick={() => {
              onContributorAddClick();
            }}
          >
            <Image
              src={'/assets/images/icons/projects/add-new.svg'}
              alt="project image"
              width={12}
              height={12}
            />
            <span className="relative  px-2">Add</span>
          </div>
        </div>
      </div>
    </>
  );
}
