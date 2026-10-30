# Jenkins LTS with the Docker CLI and kubectl added, so pipelines can build images and deploy
# to Kubernetes. Everything else (plugins, admin user) is done in the normal setup wizard.
FROM jenkins/jenkins:lts-jdk21

USER root
COPY --from=docker:28-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:28-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
ARG KUBECTL_VERSION=v1.36.1
RUN curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl
USER jenkins
