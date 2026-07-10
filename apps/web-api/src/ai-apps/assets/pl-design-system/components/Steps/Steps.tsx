import type { StepsProps, StepStatus } from './Steps.types';
import styles from './Steps.module.scss';
import clsx from 'clsx';

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <polyline
        points="2.5,7 5.5,10 11.5,4"
        stroke="white"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function resolveStatus(index: number, currentStep?: number, explicitStatus?: StepStatus): StepStatus {
  if (explicitStatus) return explicitStatus;
  if (currentStep === undefined) return 'upcoming';
  if (index < currentStep) return 'completed';
  if (index === currentStep) return 'current';
  return 'upcoming';
}

export function Steps({
  steps,
  currentStep,
  orientation = 'horizontal',
  className,
  ...props
}: StepsProps) {
  return (
    <div
      className={clsx(styles.root, styles[orientation], className)}
      role="list"
      {...props}
    >
      {steps.map((step, index) => {
        const status = resolveStatus(index, currentStep, step.status);
        const isLast = index === steps.length - 1;
        const connectorCompleted =
          currentStep !== undefined
            ? index < currentStep
            : step.status === 'completed';

        return (
          <div key={step.id} className={styles.step} role="listitem">
            <div className={styles.stepContent}>
              <div
                className={clsx(styles.circle, styles[status])}
                aria-label={`Step ${index + 1}: ${status}`}
              >
                {status === 'completed' ? <CheckIcon /> : index + 1}
              </div>
              {step.title && (
                <span className={clsx(styles.title, { [styles.current]: status === 'current' })}>
                  {step.title}
                </span>
              )}
              {step.description && (
                <span className={styles.description}>{step.description}</span>
              )}
            </div>
            {!isLast && (
              <div
                className={clsx(styles.connector, {
                  [styles.completed]: connectorCompleted,
                })}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
