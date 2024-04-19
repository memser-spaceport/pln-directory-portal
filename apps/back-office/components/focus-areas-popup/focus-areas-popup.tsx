// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries

import { TFocusArea } from 'apps/back-office/utils/teams.types';
import FocusAreas from './focus-areas';
import Modal from '../modal/modal';

interface IFocusAreasPopup {
  focusAreas: TFocusArea[];
  onClose: () => void;
  selectedItems: TFocusArea[];
  handleFoucsAreaSave: () => void;
}

const FocusAreasPopup = (props: IFocusAreasPopup) => {
  const focusAreas = props.focusAreas;
  const onClose = props.onClose;
  const selectedItems = props.selectedItems;
  const handleFoucsAreaSave = props.handleFoucsAreaSave;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
    >
      <div className="h-[70vh] w-[640px] rounded-[8px] bg-white">
        <FocusAreas
          handleFoucsAreaSave={handleFoucsAreaSave}
          onClose={onClose}
          focusAreas={focusAreas}
          selectedItems={selectedItems}
        />
      </div>
    </Modal>
  );
};

export default FocusAreasPopup;