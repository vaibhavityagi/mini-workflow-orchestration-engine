import type { WorkflowStep, StepState } from "../types/workflow";

export function getReadySteps(
  steps: WorkflowStep[],
  stepStatus: Record<string, StepState>,
): WorkflowStep[] {
  const readySteps: WorkflowStep[] = [];
  for (const step of steps) {
    if (!step.dependsOn?.length) readySteps.push(step);
    else {
      const res = step.dependsOn.every((depend) => {
        stepStatus[depend].status == "COMPLETED";
      });

      if (res) readySteps.push(step);
    }
  }

  console.log("Ready steps: ", readySteps);

  return readySteps;
}

