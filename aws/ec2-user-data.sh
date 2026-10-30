#!/bin/bash
# EC2 first-boot script (Amazon Linux 2023): Docker, Docker Compose, git and k3s Kubernetes.
# Jenkins is started afterwards by aws/setup-ec2.sh, once this has finished.
set -euxo pipefail
exec > /var/log/lab-setup.log 2>&1

# 2 GB swap, so Jenkins, image builds and Kubernetes fit in memory comfortably
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap defaults 0 0' >> /etc/fstab

# Docker + Compose and Buildx plugins + git
dnf install -y docker git
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
curl -fsSL https://github.com/docker/buildx/releases/download/v0.29.1/buildx-v0.29.1.linux-amd64 \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/*
systemctl enable --now docker
usermod -aG docker ec2-user

# k3s with Docker as its container runtime, so the images Jenkins builds can be used directly
# (like Docker Desktop's Kubernetes on the laptop). Traefik isn't needed: the site uses a NodePort.
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--docker --disable traefik --tls-san host.docker.internal --write-kubeconfig-mode 644" sh -
mkdir -p /home/ec2-user/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ec2-user/.kube/config
chown -R ec2-user:ec2-user /home/ec2-user/.kube

touch /var/log/lab-setup.done
