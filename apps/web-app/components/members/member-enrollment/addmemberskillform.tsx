import { MultiSelect } from '@protocol-labs-network/ui';
import { TeamAndRoleGrid } from './teamandrole';
import { InformationCircleIcon } from '@heroicons/react/solid';

function getAvailableTeams(teamNames, selectedTeams) {
  const availableTeams = teamNames.filter((item) =>
    selectedTeams.every((filterItem) => filterItem.teamUid !== item.value)
  );
  return availableTeams;
}

export default function AddMemberSkillForm(props) {
  const teamAndRoles = props?.formValues.teamAndRoles;
  const dropDownValues = props?.dropDownValues;
  const teamNames = getAvailableTeams(dropDownValues.teamNames, teamAndRoles);
  return (
    <>
      <div className="px-8 py-4">
        {teamAndRoles.length > 0 && (
          <div className="flex flex-row pt-4">
            <span className="basis-6/12 text-sm font-bold">Team*</span>
            <span className="basis-6/12 pl-5 text-sm font-bold">Role*</span>
          </div>
        )}
        {teamAndRoles.map((item, index) => (
          <TeamAndRoleGrid
            key={item.rowId}
            teamNames={teamNames}
            handleDeleteRolesRow={props.handleDeleteRolesRow}
            handleDropDownChange={props.handleDropDownChange}
            updateParentTeamValue={props.updateParentTeamValue}
            updateParentRoleValue={props.updateParentRoleValue}
            teamAndRole={item}
          />
        ))}
        <div>
          <button
            className="mb-3 pt-3 text-sm text-blue-500"
            onClick={props.handleAddNewRole}
          >
            + Add Team and Role
          </button>
        </div>
        <div className="flex text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="font-size-13">
            Select the team(s) that you work for & the title you hold in your
            team. If your team is not on the list, Please add your team first
            under Join the network option
          </span>
        </div>
      </div>
      <div className="px-8 py-4">
        <MultiSelect
          name="skills"
          options={dropDownValues.skillValues}
          required={true}
          selectedValues={props.formValues.skills}
          onChange={props.handleDropDownChange}
          placeholder="Enter the skills"
          label="Professional Skills"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="font-size-13">
            Share what you do! This will help us connect with others!
          </span>
        </div>
      </div>
    </>
  );
}
