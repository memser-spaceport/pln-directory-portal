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

  const dropDownValues = props.dropDownValues;

  function handleDropDownChange(selectedOption, name) {
    console.log('selectedOption', selectedOption);
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
            options={dropDownValues?.teamNames}
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
            showLabel={false}
            label="Role"
            placeholder="Enter Role"
            onChange={handleInputChange}
            value={roleTitle}
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