# EventHub: Event Management CI/CD with Jenkins and Kubernetes

A 3-tier event management website that Jenkins tests, builds and deploys to Kubernetes on every
push to `main`.

| Tier | Technology | Kubernetes |
| --- | --- | --- |
| 1. Frontend | nginx + HTML/CSS/JS: browse events, register, create events | Deployment ×2, NodePort **30090** |
| 2. Backend | Node.js (Express) REST API, 7 unit tests | Deployment ×2, ClusterIP :3000 |
| 3. Database | PostgreSQL 16 with a 1 Gi persistent volume | Deployment ×1, ClusterIP :5432 |

## Pipeline

```
 git push ──► GitHub ──(Poll SCM, every 2 min)──► Jenkins (http://localhost:8090)
                                                        │
       ┌──────────┬──────────────┬──────────────┬───────┴────────┐
   Checkout   Unit Tests    Build Images   Deploy to K8s     Smoke Test
   (git)      (7 tests,     (backend +     (kubectl apply,   (/api/health must show
              JUnit report)  frontend,      rolling update,   the new version and a
                             in parallel)   zero downtime)    connected database)
                                                        │ on failure
                                                        └──► kubectl rollout undo
```
Every image is tagged `<build number>-<commit>`, and the website shows which build is live.

## Layout

| Path | Purpose |
| --- | --- |
| `Jenkinsfile` | The CI/CD pipeline |
| `backend/` | REST API (`app.js`, `validation.js`), tests in `backend/test/`, multi-stage Dockerfile |
| `frontend/` | Website and nginx config |
| `k8s/` | Deployments and services for the 3 tiers (namespace `event-management`) |
| `k8s-setup/` | Namespace and the `jenkins-deployer` service account (RBAC) |
| `jenkins/` | The Jenkins server: Dockerfile (Jenkins LTS + Docker CLI + kubectl), docker compose, setup script |

## Setup (single instance: Jenkins and Kubernetes on one machine)

Requirements: Docker Desktop with Kubernetes enabled.

```bash
# 1. Namespace, Jenkins service account and database secret; writes jenkins/secrets/kubeconfig
bash jenkins/setup-k8s-access.sh

# 2. Start Jenkins, then finish the setup wizard at http://localhost:8090
docker compose -f jenkins/docker-compose.yml up -d --build
docker exec jenkins-event cat /var/jenkins_home/secrets/initialAdminPassword
```

3. In Jenkins: **New Item** → `event-management-cicd` → **Pipeline** → *Pipeline script from SCM*
   → Git → `https://github.com/mashhad17/event-management-cicd.git` → branch `*/main` →
   Script Path `Jenkinsfile` → **Save** → **Build Now**.
4. The website is live at **http://localhost:30090**. Later pushes deploy automatically.
