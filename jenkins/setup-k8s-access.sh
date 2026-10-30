#!/usr/bin/env bash
# One-time setup, run with your own kubectl access to Docker Desktop's Kubernetes:
#  1. creates the event-management namespace and the jenkins-deployer service account (RBAC)
#  2. creates the database password Secret (random, never stored in Git)
#  3. writes jenkins/secrets/kubeconfig, which the Jenkins container uses to deploy
set -euo pipefail
cd "$(dirname "$0")"

CONTEXT=docker-desktop
NAMESPACE=event-management
SERVER=https://kubernetes.docker.internal:6443

kubectl --context "$CONTEXT" apply -f ../k8s-setup/jenkins-access.yaml

if ! kubectl --context "$CONTEXT" -n "$NAMESPACE" get secret db-credentials >/dev/null 2>&1; then
  kubectl --context "$CONTEXT" -n "$NAMESPACE" create secret generic db-credentials \
    --from-literal=POSTGRES_DB=eventsdb \
    --from-literal=POSTGRES_USER=eventapp \
    --from-literal=POSTGRES_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
fi

for _ in $(seq 1 30); do
  TOKEN=$(kubectl --context "$CONTEXT" -n "$NAMESPACE" get secret jenkins-deployer-token -o jsonpath='{.data.token}' 2>/dev/null || true)
  [ -n "$TOKEN" ] && break
  sleep 1
done
[ -n "$TOKEN" ] || { echo "Service account token was not created" >&2; exit 1; }
CA=$(kubectl --context "$CONTEXT" -n "$NAMESPACE" get secret jenkins-deployer-token -o jsonpath='{.data.ca\.crt}')

mkdir -p secrets
cat > secrets/kubeconfig <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: docker-desktop
    cluster:
      server: $SERVER
      certificate-authority-data: $CA
users:
  - name: jenkins-deployer
    user:
      token: $(printf '%s' "$TOKEN" | base64 -d)
contexts:
  - name: jenkins-deployer@docker-desktop
    context:
      cluster: docker-desktop
      user: jenkins-deployer
      namespace: $NAMESPACE
current-context: jenkins-deployer@docker-desktop
EOF
echo "Wrote jenkins/secrets/kubeconfig for service account jenkins-deployer ($NAMESPACE)"
