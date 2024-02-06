import { ContributorsContext } from 'apps/web-app/context/projects/contributors.context';
import Image from 'next/image';
import { useContext, useState } from 'react';

export default function DefaultUI({ onAddClick, onMenuClick,showMenu, setMenuFlag }) {
//   const [showMenu, setMenuFlag] = useState(false);

  const { contributorsState, contributorsDispatch } =
    useContext(ContributorsContext);

//   const onAddClick = () => {
//     setMenuFlag(!showMenu);
//   };

//   const onMenuClick = (type) => {
//     setMenuFlag(!showMenu);
//     // setchooseTeam(true);
//     contributorsDispatch({
//       type: 'SET_CHOOSE_TEAM_POPUP',
//       payload: {
//         ...contributorsState.chooseTeamPopup,
//         showChooseTeamPopup: true,
//         chooseTeamPopupTitle: 'Select Maintainer Team',
//       },
//     });

//     contributorsDispatch({
//       type: 'SET_TYPE',
//       payload: type,
//     });
//   };

  return (
    <>
      <div className="flex items-center justify-between px-[20px] py-[20px]">
        <div className="text-sm font-normal not-italic leading-5 text-[#64748B]">
          No teams added
        </div>
        <div className="flex gap-2">
          <div
            className="cursor-pointer text-sm font-medium not-italic leading-6 text-[#156FF7]"
            onClick={() => {
              onAddClick();
            }}
          >
            <Image
              src={'/assets/images/icons/projects/add-new.svg'}
              alt="project image"
              width={12}
              height={12}
            />
            <span className="relative px-2">Add</span>
          </div>
          {showMenu && (
            <div className="relative">
              <Image
                src={'/assets/images/icons/projects/chevron-down.svg'}
                alt="project image"
                width={16}
                height={16}
              />
              <div
                className="absolute right-0 flex w-max flex-col items-start self-stretch rounded bg-white text-[13px] 
            font-normal not-italic leading-5 shadow-[0px_0px_6px_0px_rgba(0,0,0,0.14)]"
              >
                <div
                  className="cursor-pointer p-[10px]"
                  onClick={() => {
                    onMenuClick('Maintainer');
                  }}
                >
                  Maintainer Team
                </div>
                <div
                  className="cursor-pointer p-[10px]"
                  onClick={() => {
                    onMenuClick('Contributor');
                  }}
                >
                  Contributing Team
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
