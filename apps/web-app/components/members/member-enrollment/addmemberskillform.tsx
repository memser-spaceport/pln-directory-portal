import { MultiSelect } from '@protocol-labs-network/ui';
import { TeamAndRoleGrid } from './teamandrole';
import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';

function getAvailableTeams(teamNames, selectedTeams) {
  const availableTeams = teamNames?.filter((item) =>
    selectedTeams.every((filterItem) => filterItem.teamUid !== item.value)
  );
  return availableTeams;
}

export default function AddMemberSkillForm(props) {
  const teamAndRoles = props?.formValues.teamAndRoles;
  const dropDownValues = props?.dropDownValues;
  // const teamNames = getAvailableTeams(dropDownValues.teamNames, teamAndRoles);
  const teamNames = teamAndRoles.map(item=>item.teamUid);
  return (
    <>
      <div className="pt-5">
        {teamAndRoles?.length > 0 && (
          <div className="flex flex-row">
            <span className="basis-6/12 text-sm font-bold">Team*</span>
            <span className="basis-6/12 pl-3 text-sm font-bold">Role*</span>
          </div>
        )}
        {teamAndRoles?.map((item, index) => (
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
            className="pt-3 text-sm text-blue-500"
            onClick={props.handleAddNewRole}
          >
            + Add Team and Role
          </button>
        </div>
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px]  text-[#0F172A] opacity-40">
            Select the team(s) that you work for & the title you hold in your
            team. If your team is not on the list, Please add your team first
            under Join the network option
          </span>
        </div>
      </div>
      <div className="pt-5">
        <MultiSelect
          name="skills"
          options={dropDownValues.skillValues}
          required={true}
          selectedValues={props.formValues.skills}
          onChange={props.handleDropDownChange}
          placeholder="Enter the skills"
          label="Professional Skills"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Share what you do! This will help us connect with others!
          </span>
        </div>
      </div>
    </>
  );
}
