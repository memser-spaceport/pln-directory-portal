import { MultiSelect, Switch } from '@protocol-labs-network/ui';
import { TeamAndRoleGrid } from './teamandrole';
import { ReactComponent as InformationCircleIcon } from '../../public/assets/icons/info_icon.svg';

function getAvailableTeams(teamNames, selectedTeams) {
  const availableTeams = teamNames?.filter((item) =>
    selectedTeams?.every((filterItem) => filterItem.teamUid !== item.value)
  );
  return availableTeams;
}

export default function AddMemberSkillForm(props) {
  const teamAndRoles = props?.formValues.teamAndRoles;
  const dropDownValues = props?.dropDownValues;
  // const teamNames = getAvailableTeams(dropDownValues.teamNames, teamAndRoles);
  const teamNames = teamAndRoles.map((item) => item.teamUid);
  const isOpenToWorkEnabled = process.env.NEXT_PUBLIC_ENABLE_OPEN_TO_WORK;
  return (
    <>
      <div className="pt-5">
        {teamAndRoles?.length > 0 && (
          <div className="flex flex-row">
            <span className="basis-6/12 text-sm font-bold">Team*</span>
            <span className="basis-6/12 pl-1 text-sm font-bold">Role*</span>
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
            isEditEnabled={props.isEditEnabled}
          />
        ))}
        <div>
          {props.isEditEnabled && (
            <button
              className="pt-3 text-sm text-blue-500"
              onClick={props.handleAddNewRole}
            >
              + Add Team and Role
            </button>
          )}
        </div>
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
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
          disabled={!props.isEditEnabled}
          selectedValues={props.formValues.skills}
          onChange={props.handleDropDownChange}
          placeholder="Select applicable skills"
          label="Professional Skills"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Sharing your skills help other network members & teams connect with
            you.
          </span>
        </div>
      </div>
      {isOpenToWorkEnabled === 'true' && props.referenceUid && (
        <>
          <div className="pt-5">
            <div className="flex place-content-between">
              <span className="mr-2 pr-5 text-sm font-bold">
                Are you open to collaborate?
              </span>
              <Switch
                initialValue={props.formValues.openToWork}
                onChange={(evt) => {
                  const events = {
                    target: {
                      value: evt,
                      name: 'openToWork',
                    },
                  };
                  props.onChange(events);
                }}
              />
            </div>
          </div>
          <div className="flex pt-3">
            <div>
              <InformationCircleIcon className="h-5 w-5" />
            </div>
            <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
              Enabling this implies you are open to collaborate on shared ideas
              & projects with other members. This is one way to join forces &
              reach a common goal.
            </span>
          </div>
        </>
      )}
    </>
  );
}
