import type {
  QueuedStep,
  StepResult,
  Workflow,
  WorkflowStep,
} from "../types/workflow";
import { getWorkflow, setWorkflow } from "./workflow-store";
import { getReadySteps } from "./dag";
import { stepQueue } from "../queue/step-queue";
import { resultQueue } from "../queue/result-queue";
import { podManager } from "../pod-manager/pod-manager";
import { StepState, WorkflowState } from "../types/workflow";

/**
 * TODO: Implement this class.
 *
 * The orchestrator is the brain of the system. It ties together
 * the DAG resolver, step queue, result queue, and pod manager.
 *
 * submitWorkflow(workflow):
 *   1. Store workflow in workflow-store with all steps as PENDING
 *   2. Run getReadySteps() to find immediately runnable steps
 *   3. Push each ready step into the step queue
 *   4. Mark those steps as QUEUED in workflow-store
 *
 * IMPORTANT: Store the workflow state before enqueueing the first ready step.
 * Result events can come back quickly, and the result handler must be able
 * to find the workflow in workflow-store.
 *
 * start():
 *   - Begin consuming from the result queue
 *   - Begin draining the step queue (send steps to pod manager)
 *   - For Section 1: sequential is fine
 *   - For Section 2: run parallel dispatch
 *
 * On StepResult received (from result queue consumer):
 *   1. Update the step's status in workflow-store
 *   2. If COMPLETED: run getReadySteps() again, enqueue newly unblocked steps
 *   3. Check if all steps done → update workflow status to "completed" or "failed"
 *
 * INVARIANT: Backend is the ONLY place that writes stepStatus.
 * Pod manager only pushes events. Orchestrator reads events and updates state.
 */
export class Orchestrator {
  pushToStepQueue(readySteps: WorkflowStep[], workflow: WorkflowState) {
    const workflowId = workflow.workflowId;

    // update the status of ready steps to queued
    readySteps.map((step) => {
      workflow.stepState[step.id] = {
        stepId: step.id,
        status: "QUEUED",
        podId: null,
      };
    });

    setWorkflow(workflowId, workflow);

    const stepsToQueue: QueuedStep[] = readySteps.map((step) => {
      return {
        stepId: step.id,
        workflowId,
        command: step.command,
        enqueuedAt: Date.now(),
      };
    });

    console.log("Step queue steps: ", stepsToQueue);

    stepsToQueue.forEach(async (step) => await stepQueue.enqueue(step));
  }

  updateWorkflowStore(step: StepResult) {
    let workflow = getWorkflow(step.workflowId);

    if (!workflow) return;

    // update the status of each step
    workflow.stepState[step.stepId] = {
      ...workflow.stepState[step.stepId],
      status: step.status,
      podId: step.podId,
    };

    // update the status of the workflow
    workflow = {
      ...workflow,
      status: "running",
    };

    setWorkflow(step.workflowId, workflow);

    console.log(
      "Workflow after consuming the result queue: ",
      getWorkflow(step.workflowId),
    );

    const readySteps = getReadySteps(workflow.steps, workflow.stepState);

    // workflow finished
    if (readySteps.length == 0) {
      const completedWorkflow: WorkflowState = {
        ...workflow,
        status: "completed",
      };

      setWorkflow(step.workflowId, completedWorkflow);
    } else {
      // push the new ready steps to the queue
      this.pushToStepQueue(readySteps, workflow);
    }
  }

  async consumeStepQueue() {
    while (true) {
      // pull from the step queue and give it to the pod manager
      const step = await stepQueue.dequeue();
      if (step) await podManager.dispatch(step);
    }
  }

  async submitWorkflow(workflow: Workflow): Promise<void> {
    // set workflow
    const { workflowId, steps } = workflow;
    const stepStates: Record<string, StepState> = {};

    for (const step of steps) {
      stepStates[step.id] = {
        stepId: step.id,
        status: "PENDING",
        podId: null,
      };
    }

    const state: WorkflowState = {
      workflowId,
      status: "pending",
      steps,
      stepState: stepStates,
    };

    setWorkflow(workflowId, state);

    // find ready steps
    const readySteps = getReadySteps(steps, stepStates);

    // add the steps in the step queue
    this.pushToStepQueue(readySteps, state);
  }

  async resultQueueHandler(result: StepResult) {
    this.updateWorkflowStore(result);
  }

  async start(): Promise<void> {
    this.consumeStepQueue();
    // resultQueue.consume(this.resultQueueHandler);
  }
}

export const orchestrator = new Orchestrator();

