import TeamRow from "./team-row";
import React from 'react';

export default function TeamList({ onSelect, list }) {
    return (
        <div className="h-[98%] overflow-y-scroll">
            {
                list && list.map((team,index) => {
                    return (
                        <React.Fragment key={index}>
                            <TeamRow onSelect={onSelect} team={team}/>
                        </React.Fragment>
                    )
                })
            }
        </div>
    );
}