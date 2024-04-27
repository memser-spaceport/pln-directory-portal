import { Autocomplete, Switch } from '@protocol-labs-network/ui';
import {
  APP_ANALYTICS_EVENTS,
  FOCUS_AREAS_FILTER_KEYS,
} from 'apps/web-app/constants';
import { ProjectsContext } from 'apps/web-app/context/projects/project.context';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import api from 'apps/web-app/utils/api';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useContext, useEffect, useState } from 'react';
import FocusAreaFilter from '../shared/focus-area-filter/focus-area-filter';

export default function ProjectsFilter({
  filterProperties,
  isUserLoggedIn,
  parsedFilters,
}) {
  const { projectsState, projectsDispatch } = useContext(ProjectsContext);
  const { push, pathname, query } = useRouter();
  const [selectedTeam, setSelectedTeam] = useState({
    value: '',
    label: '',
    logo: '',
  });
  const analytics = useAppAnalytics();

  const selectedFocusAreas = parsedFilters?.focusAreas?.selectedItems ?? [];
  const focusAreaRawData = parsedFilters?.focusAreas?.rawData ?? [];

  useEffect(() => {
    setTeam();
  }, []);

  const setTeam = () => {
    if (query['TEAM']) {
      getSelectedOptionFromQuery(query['TEAM']).then((option) => {
        setSelectedTeam(option);
      });
    } else {
      setSelectedTeam({ value: '', label: '', logo: '' });
    }
  };

  useEffect(() => {
    const checker = filterProperties.every((ppty) => {
      return !query[ppty];
    });
    if (Object.entries(query).length && !checker) {
      setTeam();
    } else {
      projectsDispatch({ type: 'CLEAR_FILTER' });
      setSelectedTeam({ value: '', label: '', logo: '' });
      analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECTS_FILTERS_CLEARED);
    }
  }, [query]);

  const clearFilters = () => {
    const cleanQuery = { ...query };
    filterProperties.forEach((property) => delete cleanQuery[property]);

    push({ pathname, query: cleanQuery });
    projectsDispatch({ type: 'CLEAR_FILTER' });
    setSelectedTeam({ value: '', label: '', logo: '' });
    analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECTS_FILTERS_CLEARED);
  };

  const handleTeamChange = (team) => {
    setSelectedTeam(team);
    projectsDispatch({
      type: 'SET_FILTER',
      payload: { filterType: 'TEAM', value: team?.value },
    });
    analytics.captureEvent(APP_ANALYTICS_EVENTS.PROJECTS_FILTERS_APPLIED, {
      teamName: team?.label,
    });
  };

  const getSelectedOptionFromQuery = async (searchTerm) => {
    const response = await fetchTeamsById(searchTerm);

    if (response) {
      const item = response;
      return item;
    } else {
      return { value: '', label: '', logo: '' };
    }
  };

  const fetchTeamsById = async (id) => {
    try {
      const response = await api.get(`/v1/teams/${id}`);
      if (response.data) {
        // return response.data.map((item) => {
        return {
          value: response.data.uid,
          label: response.data.name,
          logo: response.data?.logo?.url ? response.data.logo.url : null,
        };
        // });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchTeamsWithLogoSearchTerm = async (searchTerm) => {
    try {
      const response = await api.get(
        `/v1/teams?name__icontains=${searchTerm}&select=uid,name,shortDescription,logo.url,industryTags.title`
      );
      if (response.data) {
        return response.data.map((item) => {
          return {
            value: item.uid,
            label: item.name,
            logo: item?.logo?.url ? item.logo.url : null,
          };
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <>
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
        <div className="flex justify-between py-[20px]">
          <div className="flex items-center gap-2">
            <div className="relative top-1">
              <Image
                src={'/assets/images/icons/projects/funding-with-bg.svg'}
                alt="project image"
                width={24}
                height={24}
              />
            </div>
            <span className="select-none text-sm text-slate-600">
              Projects Raising Funds
            </span>
          </div>
          <Switch
            initialValue={projectsState?.filterState?.FUNDING}
            onChange={(value) => {
              projectsDispatch({
                type: 'SET_FILTER',
                payload: { filterType: 'FUNDING', value },
              });
              analytics.captureEvent(
                APP_ANALYTICS_EVENTS.PROJECTS_FILTERS_APPLIED,
                {
                  raisingFunds: value,
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
            placeholder="Select Team"
            selectedOption={selectedTeam}
            onSelectOption={handleTeamChange}
            debounceCall={fetchTeamsWithLogoSearchTerm}
          />
        </div>
        <div className="mt-[20px]">
          <FocusAreaFilter
            uniqueKey={FOCUS_AREAS_FILTER_KEYS.projects}
            title={'Focus Area'}
            selectedItems={selectedFocusAreas}
            focusAreaRawData={focusAreaRawData}
          />
        </div>
      </div>
    </>
  );
}
