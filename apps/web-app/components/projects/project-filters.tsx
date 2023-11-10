import { Autocomplete, Switch } from "@protocol-labs-network/ui";
import { APP_ANALYTICS_EVENTS } from "apps/web-app/constants";
import { ProjectsContext } from "apps/web-app/context/projects/project.context";
import useAppAnalytics from "apps/web-app/hooks/shared/use-app-analytics";
import api from "apps/web-app/utils/api";
import Image from "next/image";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

export default function ProjectsFilter({ filterProperties, isUserLoggedIn }) {

    const { projectsState, projectsDispatch } = useContext(ProjectsContext);
    const { push, pathname, query } = useRouter();
    const [selectedTeam,setSelectedTeam] = useState({ value: '', label: '',logo:'' });
    const analytics = useAppAnalytics();

    useEffect(() => {
        setTeam();
    },[])

    const setTeam = () => {
        if(query['TEAM']){
            getSelectedOptionFromQuery(query['TEAM']).then((option) => {
                setSelectedTeam(option);
            })
        }else{
            setSelectedTeam({ value: '', label: '',logo:'' });
        }
    }

    // useEffect(() => {
    //     setSelectedOption().then(option=>{
    //         setSelectedTeam(option);
    //     });
    // },[projectsState.filterState.TEAM])

    const clearFilters = () => {
        const cleanQuery = { ...query };
        filterProperties.forEach((property) => delete cleanQuery[property]);

        push({ pathname, query: cleanQuery });
        projectsDispatch({ type: 'CLEAR_FILTER'});
        setSelectedTeam({ value: '', label: '',logo:'' });
        analytics.captureEvent(
            APP_ANALYTICS_EVENTS.PROJECTS_FILTERS_CLEARED
          );
    }

    const handleTeamChange = (team) => {
        setSelectedTeam(team);
        projectsDispatch({ type: 'SET_FILTER', payload: { filterType: 'TEAM', value: team?.value } });
        analytics.captureEvent(
            APP_ANALYTICS_EVENTS.PROJECTS_FILTERS_APPLIED,
            {
              'teamName': team?.label,
            }
          );
    }

    const getSelectedOptionFromQuery =async (searchTerm) => {
        const response = await fetchTeamsWithLogoSearchTerm(searchTerm);

        if (response.length) {
            const item = response[0];
            return item;
        }else{
            return { value: '', label: '',logo:'' }
        }
    }

    const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
        try {
            const response = await api.get(`/v1/teams?name__icontains=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`);
            if (response.data) {
                return response.data.map((item) => {
                    return { value: item.uid, label: item.name, logo: item?.logo?.url ? item.logo.url : null };
                });
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <>
            {/* {
                isUserLoggedIn
                &&
                <div className="flex ">
                <div className="m-auto justify-content mt-5 py-[9px] px-[24px] border rounded-[37px] text-white bg-[#156FF7] cursor-pointer"
                onClick={()=>{
                    push('/projects/add');
                }}
                >
                Add Project
                </div>
            </div>
            } */}
            <div className="relative flex items-center justify-between bg-white p-5 pl-[37px] before:absolute before:bottom-[-0.2rem] before:left-0 before:h-1 before:w-full before:border-t after:absolute after:bottom-0 after:left-0 after:h-7 after:w-[calc(100%_-_1.23rem)] after:translate-y-full after:bg-gradient-to-b after:from-white">
                <span className="text-lg font-semibold leading-7">Filters</span>
                <button
                    className="on-focus--link leading-3.5 text-xs text-blue-600 transition-colors hover:text-blue-700"
                    onClick={clearFilters}
                >
                    Clear filters
                </button>
            </div>

            <div className="h-[calc(100vh_-_148px)] overflow-y-auto p-5 pl-[37px] focus-within:outline-none focus:outline-none focus-visible:outline-none">
                <div className="py-[20px] flex justify-between">
                    <div className="flex gap-2 items-center">
                    <div className="relative top-1"><Image src={'/assets/images/icons/projects/funding-with-bg.svg'} alt="project image" width={24} height={24} /></div>
                    <span className="select-none text-sm text-slate-600">Projects Raising Funds</span>
                    </div>
                    <Switch
                        initialValue={projectsState?.filterState?.FUNDING}
                        onChange={(value) => {
                            projectsDispatch({ type: 'SET_FILTER', payload: { filterType: 'FUNDING', value } });
                            analytics.captureEvent(
                                APP_ANALYTICS_EVENTS.PROJECTS_FILTERS_APPLIED,
                                {
                                  'raisingFunds': value,
                                }
                              );
                        }}
                    />
                </div>
                <div>
                    <div className="text-[14px] font-medium">Maintained By</div>
                    <Autocomplete
                        name={'team'}
                        className="custom-grey custom-outline-none border"
                        // key={selectedTeam.label}
                        placeholder="Select Team"
                        selectedOption={selectedTeam}
                        onSelectOption={handleTeamChange}
                        debounceCall={fetchTeamsWithLogoSearchTerm}
                        // validateBeforeChange={true}
                    // validationFnBeforeChange={beforeChangeValidation}
                    // confirmationMessage={MSG_CONSTANTS.CHANGE_CONF_MSG}
                    />
                </div>
            </div>
        </>
    )
}