#!/bin/bash
# Runs ON the EC2 server: clones the project from GitHub, gives Jenkins its Kubernetes access
# and starts a fresh Jenkins on port 8080.   Usage: bash setup-ec2.sh
set -euo pipefail

until [ -f /var/log/lab-setup.done ]; do echo "waiting for first-boot setup..."; sleep 10; done

if [ -d ~/event-cicd ]; then git -C ~/event-cicd pull -q; else git clone -q https://github.com/mashhad17/event-management-cicd.git ~/event-cicd; fi
cd ~/event-cicd

K8S_CONTEXT=default K8S_SERVER=https://host.docker.internal:6443 bash jenkins/setup-k8s-access.sh
sg docker -c "docker compose -f jenkins/docker-compose.yml -f jenkins/docker-compose.ec2.yml up -d --build"

until curl -fs -o /dev/null http://localhost:8080/login; do echo "waiting for Jenkins..."; sleep 5; done
echo "Jenkins is up. Unlock password:"
sg docker -c "docker exec jenkins-event cat /var/jenkins_home/secrets/initialAdminPassword"
