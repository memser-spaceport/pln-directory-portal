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
      <div className="flex flex-row pt-4">
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
            value={{ value: team?.teamUid, label: team?.teamTitle }}
          />
        </div>
        <div className="basis-6/12 pl-5">
          <InputField
            name="role"
            required={true}
            showLabel={false}
            label="Role"
            maxLength={100}
            placeholder="Enter Role"
            className="custom-grey custom-outline-none border"
            onChange={handleInputChange}
            value={team.role}
          />
        </div>
        <div
          className="pl-3 pt-3"
          onClick={() => props.handleDeleteRolesRow(teamRowId)}
        >
          <CloseIcon className="cross-icon" />
        </div>
      </div>
    </>
  );
}
