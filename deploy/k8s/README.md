# Kubernetes Deployment Guide

## Prerequisites

- Kubernetes cluster (minikube, EKS, GKE, AKS, etc.)
- `kubectl` configured and connected
- Docker image built and pushed to a registry

## Build & Push Docker Image

```bash
# Build
docker build -t your-registry/sensa-smart-server:latest .

# Push
docker push your-registry/sensa-smart-server:latest
```

> **Note**: Update `image:` in all deployment YAML files to match your registry.

## Deploy

```bash
# 1. Create namespace
kubectl apply -f deploy/k8s/namespace.yaml

# 2. Create secrets (EDIT secret.yaml first or use CLI)
kubectl apply -f deploy/k8s/secret.yaml

# 3. Create config
kubectl apply -f deploy/k8s/configmap.yaml

# 4. Deploy services
kubectl apply -f deploy/k8s/core-api.yaml
kubectl apply -f deploy/k8s/socket-gateway.yaml
kubectl apply -f deploy/k8s/iot-gateway.yaml
kubectl apply -f deploy/k8s/worker-service.yaml

# 5. Setup ingress (EDIT hosts first)
kubectl apply -f deploy/k8s/ingress.yaml
```

Or deploy everything at once:

```bash
kubectl apply -f deploy/k8s/
```

## Verify

```bash
# Check all pods are running
kubectl get pods -n sensa-smart

# Check services
kubectl get svc -n sensa-smart

# View logs
kubectl logs -f deployment/core-api -n sensa-smart

# Check HPA status
kubectl get hpa -n sensa-smart
```

## Run Migrations

```bash
kubectl run db-migrate --rm -it \
  --image=your-registry/sensa-smart-server:latest \
  --namespace=sensa-smart \
  --env="DATABASE_URL=your-database-url" \
  -- npx prisma migrate deploy
```

## Update Deployment

```bash
# Build, push, then rolling update
docker build -t your-registry/sensa-smart-server:v2 .
docker push your-registry/sensa-smart-server:v2
kubectl set image deployment/core-api core-api=your-registry/sensa-smart-server:v2 -n sensa-smart
kubectl set image deployment/socket-gateway socket-gateway=your-registry/sensa-smart-server:v2 -n sensa-smart
kubectl set image deployment/iot-gateway iot-gateway=your-registry/sensa-smart-server:v2 -n sensa-smart
kubectl set image deployment/worker-service worker-service=your-registry/sensa-smart-server:v2 -n sensa-smart
```

## Scaling

```bash
# Manual scaling
kubectl scale deployment core-api --replicas=5 -n sensa-smart

# HPA handles auto-scaling for core-api (min: 2, max: 10)
```
