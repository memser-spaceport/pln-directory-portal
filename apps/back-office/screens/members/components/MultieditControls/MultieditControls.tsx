import React from 'react';

interface Props {
  ids: string[];
  onReset: () => void;
  authToken: string;
}

export const MultieditControls = ({ ids }: Props) => {
  if (ids.length === 0) {
    return null;
  }
  return <></>;
};
