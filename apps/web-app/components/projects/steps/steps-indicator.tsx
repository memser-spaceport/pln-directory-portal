import { AddProjectsContext } from 'apps/web-app/context/projects/add.context';
import Image from 'next/image';
import { useContext } from 'react';

export default function ProjectStepIndicator() {
  const { addProjectsState, addProjectsDispatch } =
    useContext(AddProjectsContext);

  const getImage = () => {
    switch (addProjectsState.currentStep) {
      case 0:
        return '/assets/images/projects/step1.svg';
      case 1:
        return '/assets/images/projects/step2.svg';
      case 2:
        return '/assets/images/projects/step3.svg';
      case 3:
        return '/assets/images/projects/step4.svg';
    }
  };
  return (
    <>
      {/* Step {addProjectsState.currentStep} */}
      <img src={getImage()} className="w-[916px]" />
      {/* <Image src={'/assets/images/projects/step1.svg'} alt="tea image" width={916} height={32}
                                className='' /> */}
    </>
  );
}
