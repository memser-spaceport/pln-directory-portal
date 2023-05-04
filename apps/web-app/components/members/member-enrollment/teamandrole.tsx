import { ChangeEvent, useState } from 'react';
import { InputField, Autocomplete } from '@protocol-labs-network/ui';
import { XIcon as CloseIcon } from '@heroicons/react/outline';
import { fetchTeamsForAutocomplete } from '../../../utils/services/dropdown-service';

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

  function handleDropDownChange(selectedOption) {
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
          <Autocomplete
            name="team"
            className="custom-grey custom-outline-none border"
            required={true}
            disabled={false}
            placeholder="Select a Team"
            selectedOption={{ value: team?.teamUid, label: team?.teamTitle }}
            onSelectOption={handleDropDownChange}
            excludeValues={teamNames}
            debounceCall={fetchTeamsForAutocomplete}
          />
        </div>
        <div className="basis-5/12 pl-5">
          <InputField
            name="role"
            required={true}
            showLabel={false}
            label="Role"
            maxLength={100}
            placeholder="Enter the Role"
            className="custom-grey custom-outline-none border"
            onChange={handleInputChange}
            value={team.role}
          />
        </div>
        <div className="basis-1/12 pl-3 pt-5 ">
          <div
            className={teamRowId > 1 ? `cursor-pointer` : `invisible`}
            onClick={() => props.handleDeleteRolesRow(teamRowId)}
          >
            <CloseIcon className="cross-icon" />
          </div>
        </div>
      </div>
    </>
  );
}
