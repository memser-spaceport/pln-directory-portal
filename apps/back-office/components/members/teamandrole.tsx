import { ChangeEvent, useState } from 'react';
import { InputField, Dropdown } from '@protocol-labs-network/ui';
import { XIcon as CloseIcon } from '@heroicons/react/outline';

interface Team {
  teamUid: string;
  teamTitle: string;
}

export function TeamAndRoleGrid(props) {
  const [teamDetail, setTeamDetail] = useState<Team>(props?.teamAndRole.team);
  const [teamRowId] = useState(props?.teamAndRole.rowId);
  const [roleTitle, setRoleTitle] = useState(props?.teamAndRole.role);
  const team = props?.teamAndRole;

  const teamNames = props.teamNames;

  function handleDropDownChange(selectedOption, name) {
    setTeamDetail(selectedOption);
    props.updateParentTeamValue(
      selectedOption.value,
      selectedOption.label,
      props?.teamAndRole.rowId
    );
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { value } = event.target;
    setRoleTitle(value);
    props.updateParentRoleValue(value, props?.teamAndRole.rowId);
  }

  return (
    <>
      <div className="flex flex-row">
        <div className="basis-6/12">
          <Dropdown
            name="team"
            required={true}
            options={teamNames}
            initialOption={{
              value: teamDetail?.teamUid,
              label: teamDetail?.teamTitle,
            }}
            onChange={handleDropDownChange}
            disabled={!props.isEditEnabled}
            className="custom-grey custom-outline-none border"
            value={{ value: team?.teamUid, label: team?.teamTitle }}
          />
        </div>
        <div className="basis-5/12 pl-5">
          <InputField
            name="role"
            required={true}
            showLabel={false}
            label="Role"
            maxLength={100}
            placeholder="Enter Role"
            disabled={!props.isEditEnabled}
            className="custom-grey custom-outline-none border"
            onChange={handleInputChange}
            value={team.role}
          />
        </div>
        <div className="basis-1/12 cursor-pointer pl-3 pt-6">
          <div
            className={
              teamRowId > 1 && !props.isEditEnabled
                ? `cursor-pointer"`
                : `invisible`
            }
            onClick={() => props.handleDeleteRolesRow(teamRowId)}
          >
            <CloseIcon className="cross-icon" />
          </div>
        </div>
      </div>
    </>
  );
}
