import express from "express";
import { podPool } from "../k8s/pod-pool";
import { orchestrator } from "./orchestrator";
import { getWorkflow } from "./workflow-store";

const app = express();
app.use(express.json());

// POST /workflow
// Students implement: store workflow, find ready steps, enqueue them
app.post("/workflow", async (req, res) => {
  const workflow = req.body;

  try {
    orchestrator.submitWorkflow(workflow);
    res.status(200).json({ workflowId: workflow.id, status: "accepted" });
  } catch (error) {
    res.status(500).json({ error });
  }
});

// GET /workflow/:id
// Students implement: read from workflow-store and return current state
app.get("/workflow/:id", (req, res) => {
  const workflowId = req.params.id;

  const workflow = getWorkflow(workflowId);

  res.status(200).json({ workflow });
});

// GET /pods  — already implemented, useful for debugging
app.get("/pods", async (_req, res) => {
  const status = podPool.getPoolStatus();
  res.json(status);
});

export { app };

