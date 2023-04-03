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
          {step.number}
        </span>
      </div>
      <span className="mt-1 text-xs text-blue-500">{step.name}</span>
    </div>
  );
}

export default function FormStepsIndicator({
  formStep,
  steps,
}: FormStepIndicatorProps) {
  return (
    <div className="flex flex-row justify-evenly border-b-2">
      {steps.map((step) => {
        return getFormStepIndicatorShape(step, formStep);
      })}
    </div>
  );
}
