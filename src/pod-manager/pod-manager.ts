import type { QueuedStep, StepResult } from "../types/workflow";
import { podPool } from "../k8s/pod-pool";
import { resultQueue } from "../queue/result-queue";

/**
 * TODO: Implement this class.
 *
 * The pod manager receives a step, runs it inside a leased pod,
 * and publishes status events to the result queue.
 *
 * dispatch(step) must:
 *   1. Call podPool.acquirePod() to lease a free pod
 *   2. Push { status: "RUNNING", podId, stepId, workflowId } to resultQueue
 *   3. Call podPool.execInPod(podId, step.command)
 *   4. Push { status: "COMPLETED", stdout, exitCode: 0 } to resultQueue
 *   5. Call podPool.releasePod(podId)
 *
 *   On any error:
 *   4. Push { status: "FAILED", error: err.message } to resultQueue
 *   5. Call podPool.releasePod(podId)  ← always release in finally block
 *
 * IMPORTANT: Pod manager never reads or writes workflow state.
 * It only pushes to the result queue.
 */
export class PodManager {
  async pushToResultQueue(
    podId: string,
    queStep: QueuedStep,
    status: "RUNNING" | "COMPLETED" | "FAILED",
  ) {
    const step: StepResult = {
      stepId: queStep.stepId,
      workflowId: queStep.workflowId,
      podId,
      status,
    };
    await resultQueue.push(step);
  }

  async dispatch(step: QueuedStep): Promise<void> {
    const pod = await podPool.acquirePod();

    await this.pushToResultQueue(pod.podId, step, "RUNNING");

    await podPool.execInPod(pod.podId, step.command);

    await this.pushToResultQueue(pod.podId, step, "COMPLETED");

    await podPool.releasePod(pod.podId);
  }
}

export const podManager = new PodManager();

