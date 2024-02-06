import { createContext, useReducer } from 'react';

export const ContributorsContext = createContext({
  contributorsState: null,
  contributorsDispatch: null,
});

export function ContributorsContextProvider(props) {
  const defaultState = {
    chooseTeamPopup : {
        showChooseTeamPopup: false,
        chooseTeamPopupTitle: '',
        chooseTeamPopupMode: 'ADD',
        UIType: 'TEAM',
        selectedTeam: null
    },
    type:'',

    maintainerTeamDetails: null
  };

  const reducer = (state, action) => {
    
    const newState = { ...state };
    
    switch (action.type) {
      case 'SET_CHOOSE_TEAM_POPUP':
        newState.chooseTeamPopup = { ...action.payload };
        break;
      case 'SET_TYPE':
        newState.type = action.payload;
        break;
      case 'SET_MAINTAINER':
        newState.maintainerTeamDetails = { ...action.payload };
        break;
    }
    
    return newState;
  };

  const [contributorsState, contributorsDispatch] = useReducer(
    reducer,
    defaultState
  );
  return (
    <ContributorsContext.Provider
      value={{ contributorsState, contributorsDispatch }}
    >
      {props.children}
    </ContributorsContext.Provider>
  );
}
