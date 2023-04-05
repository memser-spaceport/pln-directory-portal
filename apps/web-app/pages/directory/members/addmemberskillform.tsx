import { MultiSelect } from '@protocol-labs-network/ui';
import { TeamAndRoleGrid } from './teamandrole';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberSkillForm(props) {
  const teamAndRoles = props?.formValues.teamAndRoles;
  const dropDownValues = props?.dropDownValues;

  return (
    <>
      <div className="px-8 py-4">
        {teamAndRoles.length > 0 && (
          <div className="flex flex-row pt-4">
            <span className="text-sm font-bold basis-5/12">Team*</span>
            <span className="text-sm font-bold basis-5/12 pl-5">Role*</span>
          </div>
        )}
        {teamAndRoles.map((item, index) => (
          <TeamAndRoleGrid
            key={item.rowId}
            dropDownValues={dropDownValues}
            handleDeleteRolesRow={props.handleDeleteRolesRow}
            handleDropDownChange={props.handleDropDownChange}
            updateParentTeamValue={props.updateParentTeamValue}
            updateParentRoleValue={props.updateParentRoleValue}
            teamAndRole={item}
          />
        ))}
        <div>
          <button
            className="pt-3 text-blue-500 text-sm mb-3"
            onClick={props.handleAddNewRole}
          >
            + Add Role
          </button>
        </div>
        <div className="flex text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="font-size-13">
            Select the team(s) that you work for & the title you hold in your
            team. If your team is not on the list, click here & add your team
            first.
          </span>
        </div>
      </div>
      <div className="px-8">
        <MultiSelect
          name="skills"
          options={dropDownValues.skillValues}
          selectedValues={props.formValues.skills}
          onChange={props.handleDropDownChange}
          placeholder="Enter the skills"
          label="Professional Skills"
        />
        <div className="flex text-sm text-gray-400">
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
