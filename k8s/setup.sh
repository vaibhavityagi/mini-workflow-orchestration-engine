#!/bin/bash
set -e

CLUSTER_NAME="workflow-cluster"
CONTEXT_NAME="kind-${CLUSTER_NAME}"

if ! command -v kind >/dev/null; then
  echo "Error: kind is not installed or is not on PATH."
  exit 1
fi

echo "Creating kind cluster..."
if kind get clusters | grep -qx "$CLUSTER_NAME"; then
  echo "Cluster already exists"
else
  kind create cluster --name "$CLUSTER_NAME"
fi

# Restore/select kubectl's connection to this local cluster.
kind export kubeconfig --name "$CLUSTER_NAME"
kubectl config use-context "$CONTEXT_NAME"
kubectl cluster-info --context "$CONTEXT_NAME"

echo "Applying manifests..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/runner-pod.yaml

echo "Waiting for StatefulSet rollout..."
kubectl rollout status statefulset/runner -n workflow-runner --timeout=120s

echo "Waiting for all runner pods to exist..."
until [ "$(kubectl get pods -l app=runner -n workflow-runner --no-headers 2>/dev/null | wc -l | tr -d ' ')" = "7" ]; do
  sleep 1
done

echo "Waiting for runner pods to be ready..."
kubectl wait --for=condition=Ready pod -l app=runner -n workflow-runner --timeout=120s

echo ""
echo "✅ Setup complete. 7 runner pods are live."
echo "Run: bun run dev"
