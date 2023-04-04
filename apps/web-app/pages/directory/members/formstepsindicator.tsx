import { ReactComponent as HexagonOutline } from '../../../public/assets/images/icons/Hexagon_Transparent.svg';

interface StepDetails {
  number: number;
  name: string;
}

interface FormStepIndicatorProps {
  formStep: number;
  steps: StepDetails[];
}

function getShapeClass(step, formStep) {
  const className = step <= formStep ? 'fill-blue-600' : '';
  return className;
}

function getStepNumberClass(step, formStep) {
  const className =
    step <= formStep ? 'absolute text-white' : 'absolute text-blue-600';
  return className;
}

function getFormStepIndicatorShape(step, formStep) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center">
        <HexagonOutline
          className={getShapeClass(step.number, formStep)}
          height={50}
          width={50}
        />
        <span className={getStepNumberClass(step.number, formStep)}>
          {(() => {
            if (formStep === 2) {
              if (step.number === 1) {
                return (
                  <svg
                    width="14"
                    height="11"
                    viewBox="0 0 14 11"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M13 1L4.75 9.25L1 5.5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                );
              } else {
                return <>{step.number}</>;
              }
            } else if (formStep === 3) {
              if (step.number === 1 || step.number === 2) {
                return (
                  <svg
                    width="14"
                    height="11"
                    viewBox="0 0 14 11"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M13 1L4.75 9.25L1 5.5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                );
              } else {
                return <>{step.number}</>;
              }
            } else {
              return <>{step.number}</>;
            }
          })()}
        </span>
      </div>
      <span className="mt-1 text-xs text-blue-500">{step.name}</span>
    </div>
  );
}

function drawHr() {
  return <hr className="step-line flex w-full flex-col items-center"></hr>;
}

export default function FormStepsIndicator({
  formStep,
  steps,
}: FormStepIndicatorProps) {
  return (
    <div className="flex flex-row justify-evenly border-b-2 pb-4 pr-8 pl-8">
      {steps.map((step, index) => {
        return (
          <>
            {getFormStepIndicatorShape(step, formStep)}
            {index !== steps.length - 1 ? drawHr() : null}
          </>
        );
      })}
    </div>
  );
}
