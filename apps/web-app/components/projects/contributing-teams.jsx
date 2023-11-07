import { XIcon as CloseIcon } from '@heroicons/react/outline';
import { Autocomplete } from "@protocol-labs-network/ui";
import { AddProjectsContext } from "apps/web-app/context/projects/add.context";
import api from "apps/web-app/utils/api";
import { useContext, useEffect, useState } from "react";

export default function ContributingTeams() {

    const { addProjectsState, addProjectsDispatch } = useContext(AddProjectsContext);

    const [excludeList, setExcludeList] = useState([]);

    useEffect(() => {
        if(addProjectsState.mode === 'EDIT'){
            const exclude = addProjectsState.inputs.contributingTeams.map(t=>t.value);
            setExcludeList(exclude);
        }
    },[])


    const handleContributingTeamsChange = (team) => {
        let exitingTeams = addProjectsState.inputs.contributingTeams;
        exitingTeams = [...exitingTeams, team];
        addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'contributingTeams': exitingTeams } });
        const existingExcludeList = [...excludeList];
        setExcludeList([...existingExcludeList, team.value]);
    }

    const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
        try {
            const response = await api.get(`/v1/teams?name__istartswith=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`);
            if (response.data) {
                return response.data.map((item) => {
                    return { value: item.uid, label: item.name, logo: item?.logo?.url ? item.logo.url : null };
                });
            }
        } catch (error) {
            console.error(error);
        }
    };

    const getTeamTagTemplate = () => {
        return addProjectsState.inputs.contributingTeams.map((team, index) => {
            return (
                <div className="flex gap-1 bg-slate-200 p-2 rounded-[8px] text-sm" key={'team' + index}>
                    <div>
                        {team.label}
                    </div>
                    <div className="cursor-pointer" onClick={() => { onDeleteContributingTeam(index) }}>
                        <CloseIcon className="cross-icon relative top-[3px]" />
                    </div>
                </div>
            );
        })
    }

    const getContributingTeamsTeamplate = () => {
        return (
            <>
                <div className={`flex gap-2 flex-wrap ${addProjectsState.inputs.contributingTeams.length > 0 ? 'pt-3' : ''}`}>
                    {getTeamTagTemplate()}
                </div>
            </>
        );
    }

    const onDeleteContributingTeam = (index) => {
        const currentTeams = [...addProjectsState.inputs.contributingTeams];
        currentTeams.splice(index, 1);
        addProjectsDispatch({ type: 'SET_INPUT', payload: { ...addProjectsState.inputs, 'contributingTeams': [...currentTeams] } });
        const existingExcludeList = [...excludeList];
        existingExcludeList.splice(index, 1)
        setExcludeList([...existingExcludeList]);
    }

    return (
        <>
            <div>   
                <div className="text-sm font-bold">Contributing Teams</div>
                {getContributingTeamsTeamplate()}
                <Autocomplete
                    name={'project'}
                    className="custom-grey custom-outline-none border"
                    placeholder="Select Team"
                    // selectedOption={
                    //     addProjectsState.inputs.contributingTeams.length > 0
                    //         ?
                    //         addProjectsState.inputs.contributingTeams[addProjectsState.inputs.contributingTeams.length - 1]
                    //         :
                    //         { value: '', label: '', logo: '' }
                    // }
                    selectedOption={{ value: '', label: '', logo: '' }}
                    excludeValues={excludeList}
                    onSelectOption={handleContributingTeamsChange}
                    debounceCall={fetchTeamsWithLogoSearchTerm}
                />
            </div>
        </>
    );
}