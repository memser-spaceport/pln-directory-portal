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
  const teamNames = teamAndRoles.map((item) => item.teamUid);
  return (
    <>
      <div className="pt-5">
        {teamAndRoles?.length > 0 && (
          <div className="flex flex-row">
            <span className="basis-6/12 text-sm font-bold">Team*</span>
            <span className="basis-5/12 pl-3 text-sm font-bold">Role*</span>
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
            If you don&apos;t see your team on this list please add your team
            first by using &apos;Join the network&apos; - &apos;As a Team&apos;
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
          placeholder="Select applicable skills"
          label="Professional Skills"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Sharing your skills help other network members & teams connect with
            you.
          </span>
        </div>
      </div>
      {!props.isNewMode && (
        <div className="pt-5">
          <span className="mr-2 text-sm font-bold">Are you open to Work?</span>
          <div className="flex pt-3">
            <div className="basis-1/4">
              <label className="text-[14px] font-medium leading-[24px]">
                <input
                  type="radio"
                  value="no"
                  name="openToWork"
                  checked={!props.formValues?.openToWork}
                  onChange={(e) => {
                    const events = {
                      target: {
                        value: false,
                        name: 'openToWork',
                      },
                    };
                    props.onChange(events);
                  }}
                />
                <span className="pl-1">No</span>
              </label>
            </div>
            <div className="basis-1/4">
              <label className="pl-1 text-[14px] font-medium leading-[24px]">
                <input
                  type="radio"
                  value="yes"
                  name="openToWork"
                  checked={props.formValues?.openToWork}
                  onChange={(e) => {
                    const events = {
                      target: {
                        value: true,
                        name: 'openToWork',
                      },
                    };
                    props.onChange(events);
                  }}
                />
                <span className="pl-1">Yes</span>
              </label>
            </div>
          </div>
          <div className="flex pt-3">
            <div>
              <InformationCircleIcon />
            </div>
            <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
              Enabling this will inform others in the network that you are open
              to working on other teams & projects.
            </span>
          </div>
        </div>
      )}
    </>
  );
}
