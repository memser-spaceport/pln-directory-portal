import {
  Dispatch,
  SetStateAction,
  createContext,
  useContext,
  useState,
} from 'react';
import { IPendingResponse } from '../utils/request.types';

interface NavbarContextProps {
  teamCount: number;
  memberCount: number;
  isTeamActive: boolean;
  setIsTeamActive: Dispatch<SetStateAction<boolean>>;
  isOpenRequest: boolean;
  setIsOpenRequest: Dispatch<SetStateAction<boolean>>;
  // onItemClick: (any) => void;
  memberList: IPendingResponse[];
  setMemberList: Dispatch<SetStateAction<IPendingResponse[]>>;
  teamList: IPendingResponse[];
  setTeamList: Dispatch<SetStateAction<IPendingResponse[]>>;
}

const NavbarContext = createContext<NavbarContextProps>({
  teamCount: 0,
  memberCount: 0,
  isTeamActive: true,
  setIsTeamActive: () => null,
  isOpenRequest: true,
  setIsOpenRequest: () => null,
  // onItemClick: (flag) => {
  //   return null;
  // },
  memberList: [],
  setMemberList: () => null,
  teamList: [],
  setTeamList: () => null,
});

export function useNavbarContext() {
  return useContext(NavbarContext);
}

export function NavbarContextProvider(props) {
  const [isTeamActive, setIsTeamActive] = useState<boolean>(true);
  const [isOpenRequest, setIsOpenRequest] = useState<boolean>(true);
  const [teamList, setTeamList] = useState<IPendingResponse[]>();
  const [memberList, setMemberList] = useState<IPendingResponse[]>();

  // const navbarVaues = useMemo(
  //   () => ({
  //     teamCount: teamList?.length ?? 0,
  //     memberCount: memberList?.length ?? 0,
  //     isTeamActive: isTeamActive,
  //     setIsTeamActive: setIsTeamActive,
  //     setIsOpenRequest: setIsOpenRequest,
  //     isOpenRequest: isOpenRequest,
  //     setTeamList: setTeamList,
  //     teamList: teamList,
  //     setMemberList: setMemberList,
  //     memberList: memberList,
  //     updateTeamList: updateTeamList
  //   }),
  //   [isOpenRequest, isTeamActive, memberList, teamList]
  // );

  const navbarVaues = {
    teamCount: teamList?.length ?? 0,
    memberCount: memberList?.length ?? 0,
    isTeamActive: isTeamActive,
    setIsTeamActive: setIsTeamActive,
    setIsOpenRequest: setIsOpenRequest,
    isOpenRequest: isOpenRequest,
    setTeamList: setTeamList,
    teamList: teamList,
    setMemberList: setMemberList,
    memberList: memberList,
  };

  return (
    <NavbarContext.Provider value={navbarVaues}>
      {props.children}
    </NavbarContext.Provider>
  );
}
