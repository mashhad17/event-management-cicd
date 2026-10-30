// CI/CD pipeline for the 3-tier Event Management website:
// GitHub -> unit tests -> Docker images -> Kubernetes -> smoke test, with automatic rollback.
pipeline {
  agent any

  // Jenkins checks the GitHub repo every 2 minutes and builds when there's a new commit.
  triggers {
    pollSCM('H/2 * * * *')
  }

  options {
    timestamps()
    timeout(time: 20, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
    skipDefaultCheckout()   // the Checkout stage does it explicitly
  }

  parameters {
    booleanParam(name: 'RUN_TESTS', defaultValue: true, description: 'Run the backend unit tests before building')
  }

  environment {
    NAMESPACE      = 'event-management'
    BACKEND_IMAGE  = 'event-backend'
    FRONTEND_IMAGE = 'event-frontend'
    // Kubernetes access for the jenkins-deployer service account (mounted into the container).
    KUBECONFIG     = '/run/secrets/kubeconfig'
    // The website's NodePort, as seen from inside the Jenkins container.
    APP_URL        = 'http://host.docker.internal:30090'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.GIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.IMAGE_TAG = "${env.BUILD_NUMBER}-${env.GIT_SHORT}"
        }
        echo "Building commit ${env.GIT_SHORT} as image tag ${env.IMAGE_TAG}"
      }
    }

    stage('Unit Tests') {
      // params.RUN_TESTS is null on the very first build, so only skip on an explicit false.
      when { expression { params.RUN_TESTS != false } }
      steps {
        sh '''
          docker build --target test -t ${BACKEND_IMAGE}:test-${BUILD_NUMBER} backend
          cid=$(docker create ${BACKEND_IMAGE}:test-${BUILD_NUMBER})
          docker cp "$cid":/app/test-results.xml backend/test-results.xml
          docker rm "$cid"
        '''
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/test-results.xml'
        }
      }
    }

    stage('Build Images') {
      parallel {
        stage('Backend') {
          steps {
            sh 'docker build --target runtime --build-arg APP_VERSION=${IMAGE_TAG} -t ${BACKEND_IMAGE}:${IMAGE_TAG} backend'
          }
        }
        stage('Frontend') {
          steps {
            sh 'docker build --build-arg APP_VERSION=${IMAGE_TAG} -t ${FRONTEND_IMAGE}:${IMAGE_TAG} frontend'
          }
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        script { env.DEPLOY_STARTED = 'true' }
        sh '''
          for f in k8s/*.yaml; do echo '---'; sed "s|__IMAGE_TAG__|${IMAGE_TAG}|g" "$f"; done | kubectl apply -f -

          kubectl -n ${NAMESPACE} rollout status deployment/database --timeout=180s
          kubectl -n ${NAMESPACE} rollout status deployment/backend  --timeout=180s
          kubectl -n ${NAMESPACE} rollout status deployment/frontend --timeout=120s
          kubectl -n ${NAMESPACE} get deployments,pods,services -o wide
        '''
      }
    }

    stage('Smoke Test') {
      steps {
        sh '''
          for i in $(seq 1 20); do
            health=$(curl -fsS "${APP_URL}/api/health" || true)
            echo "Attempt $i: $health"
            if echo "$health" | grep -q '"database":"connected"' && echo "$health" | grep -q "\\"version\\":\\"${IMAGE_TAG}\\""; then
              curl -fsS "${APP_URL}/version.json" | grep -q "${IMAGE_TAG}"
              curl -fsS "${APP_URL}/api/events" > /dev/null
              echo "Smoke test passed: version ${IMAGE_TAG} is live with a connected database"
              exit 0
            fi
            sleep 3
          done
          echo "Smoke test failed: ${IMAGE_TAG} is not serving healthy responses"
          exit 1
        '''
      }
    }
  }

  post {
    success {
      echo "Deployed ${env.IMAGE_TAG}. Open http://localhost:30090"
    }
    failure {
      script {
        if (env.DEPLOY_STARTED == 'true') {
          echo 'Deployment failed, rolling back backend and frontend to the previous version'
          sh '''
            kubectl -n ${NAMESPACE} rollout undo deployment/backend  || true
            kubectl -n ${NAMESPACE} rollout undo deployment/frontend || true
          '''
        }
      }
    }
    always {
      // Keep the images of the last 5 builds (for rollbacks) and remove older ones.
      sh '''
        docker image rm ${BACKEND_IMAGE}:test-${BUILD_NUMBER} > /dev/null 2>&1 || true
        for repo in ${BACKEND_IMAGE} ${FRONTEND_IMAGE}; do
          docker image ls "$repo" --format '{{.Tag}}' | grep -E '^[0-9]+-' | sort -t- -k1,1nr | tail -n +6 \
            | xargs -r -I{} docker image rm "$repo:{}" > /dev/null 2>&1 || true
        done
      '''
    }
  }
}
