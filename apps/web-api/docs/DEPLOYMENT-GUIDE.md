---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Environment Configuration](#3-environment-configuration)
4. [Deployment Automation](#4-deployment-automation)
5. [Infrastructure Pipeline Integration](#5-infrastructure-pipeline-integration)
6. [Secrets Management](#6-secrets-management)
7. [GitHub Secrets Configuration](#7-github-secrets-configuration)
8. [Deployment Workflows](#8-deployment-workflows)
9. [Manual Deployment](#9-manual-deployment)
10. [Troubleshooting](#10-troubleshooting)
11. [Monitoring and Maintenance](#11-monitoring-and-maintenance)

---

## 1. Overview

The Directory Service deployment is fully automated using GitHub Actions workflows that integrate with the **pl-infra-pipeline** repository. This guide covers the complete deployment process for all environments (Development, UAT, and Production) and explains how the service leverages the shared infrastructure pipeline.

### Key Features
- **Automated CI/CD**: GitHub Actions workflows for all environments
- **Infrastructure as Code**: Terraform-based infrastructure provisioning
- **Secrets Management**: AWS SSM Parameter Store integration for secrets and envs
- **Container Orchestration**: Kubernetes with Helm charts
- **Multi-Environment Support**: Dev, UAT, and Production environments
- **Cost Optimization**: Shared infrastructure for Dev/UAT environments

### ⚠️ Important: Infrastructure vs Deployment Automation

**What's Automated:**
- ✅ **Build Process**: Docker image building and pushing to ECR
- ✅ **Deployment Process**: Kubernetes deployment via Helm charts
- ✅ **Configuration Management**: SSM Parameter Store → Kubernetes secrets sync

**What's Manual:**
- ❌ **Infrastructure Provisioning**: Terraform infrastructure setup requires manual `terraform apply`
- ❌ **Initial Infrastructure Setup**: VPC, EKS clusters, RDS, ElastiCache, SQS creation
- ❌ **Infrastructure Updates**: Changes to Terraform modules require manual deployment

**Summary**: Only the application build and deployment to existing infrastructure is automated. The underlying AWS infrastructure (VPC, EKS, RDS, etc.) must be provisioned manually using Terraform.

---

## 2. Architecture

### High-Level Architecture

The Directory Service deployment architecture consists of three main components:

#### 1. GitHub Repository Layer
- **protocol-labs-network repo**: Contains application code and GitHub Actions workflows
- **GitHub Actions Workflows**: Automated CI/CD pipelines for each environment

#### 2. AWS Infrastructure Layer
- **ECR Container Registry**: Stores Docker images for the application
- **EKS Kubernetes Clusters**: Container orchestration platform
- **SSM Parameter Store**: Secure secrets and configuration management
- **RDS PostgreSQL**: Managed database service
- **ElastiCache Redis**: Caching and session storage
- **SQS Message Queues**: Asynchronous message processing

#### 3. Infrastructure Pipeline Layer
- **pl-infra-pipeline repo**: Shared infrastructure as code repository
- **Terraform Modules**: Infrastructure provisioning and management
- **Helm Charts**: Kubernetes deployment templates
- **Config Generation Scripts**: Automated secrets sync from SSM to Kubernetes

#### Data Flow
1. **Code Push** → GitHub Actions Workflows trigger
2. **Build & Push** → Docker images built and pushed to ECR
3. **Infrastructure Checkout** → pl-infra-pipeline repository cloned
4. **Config Generation** → SSM parameters synced to Kubernetes secrets
5. **Helm Deployment** → Application deployed to EKS cluster
6. **Service Access** → Application connects to RDS, Redis, and SQS services

### Environment Structure

| Environment | VPC | EKS Cluster | Node Group | Namespace | Domain |
|-------------|-----|-------------|------------|-----------|---------|
| **Development** | preprod-pln | preprod-pln | pln-dev-k8s | pln-dev | dev-directory.plnetwork.io |
| **UAT** | preprod-pln | preprod-pln | pln-uat-k8s | pln-uat | api-uat-directory.plnetwork.io |
| **Production** | prod-pln | prod-pln | pln-k8s | pln-prod | api-directory.plnetwork.io |

**🌐 DNS Configuration**: Ensure that the ingress hosts specified in the Helm charts are properly mapped with CNAME records to the Kubernetes cluster's load balancer in your DNS provider. This is essential for external access to the application endpoints.

---

## 3. Environment Configuration

### 3.1 Development Environment

**Purpose**: Local development and testing  
**Trigger**: Push to `develop` branch  
**Infrastructure**: Shared preprod VPC with dedicated node group

**Configuration**:
```yaml
ENVIRONMENT: dev
APPNAME: directory-service
APP_MODE: directory_service
CLUSTER_NAME: preprod-pln
NODE_SELECTOR: pln-dev-k8s
NAMESPACE: pln-dev
DOMAIN: dev-directory.plnetwork.io
```

### 3.2 UAT Environment

**Purpose**: User acceptance testing  
**Trigger**: Push to `release/*` branches  
**Infrastructure**: Shared preprod VPC with dedicated node group

**Configuration**:
```yaml
ENVIRONMENT: uat
APPNAME: directory-service
APP_MODE: directory_service
CLUSTER_NAME: preprod-pln
NODE_SELECTOR: pln-uat-k8s
NAMESPACE: pln-uat
DOMAIN: api-uat-directory.plnetwork.io
```

### 3.3 Production Environment

**Purpose**: Live production workloads  
**Trigger**: Push to `main` branch or manual dispatch  
**Infrastructure**: Dedicated production VPC and cluster

**Configuration**:
```yaml
ENVIRONMENT: prod
APPNAME: directory-service
APP_MODE: directory_service
CLUSTER_NAME: prod-pln
NODE_SELECTOR: pln-k8s
NAMESPACE: pln-prod
DOMAIN: api-directory.plnetwork.io
```

---

## 4. Deployment Automation

### 4.1 GitHub Actions Workflow Structure

Each environment has its own dedicated workflow file:

- **`.github/workflows/dev_eks_deployment.yaml`** - Development deployment
- **`.github/workflows/uat_eks_deployment.yaml`** - UAT deployment  
- **`.github/workflows/prod_eks_deployment.yaml`** - Production deployment

### 4.2 Workflow Steps

All workflows follow the same pattern:

1. **Repository Checkout**: Checkout protocol-labs-network code
2. **AWS Authentication**: Configure AWS credentials
3. **ECR Login**: Authenticate with Amazon ECR
4. **Docker Build**: Build application container image
5. **Image Tagging**: Tag with git hash and environment
6. **ECR Push**: Push images to container registry
7. **Infrastructure Checkout**: Checkout pl-infra-pipeline repository
8. **Config Generation**: Generate Kubernetes secrets from SSM
9. **Helm Deployment**: Deploy to Kubernetes using Helm

**Note**: These workflows assume the underlying AWS infrastructure (EKS clusters, RDS, ElastiCache, etc.) already exists. Infrastructure provisioning is handled separately via manual Terraform operations.

---

## 5. Infrastructure Pipeline Integration

### 5.1 pl-infra-pipeline Repository

The **pl-infra-pipeline** repository serves as the **core infrastructure backbone** for the Protocol Labs Network (PLN) platform. It provides a modular, reusable infrastructure foundation that services like `directory-service` can plug into for their deployment needs.

**Repository**: [https://github.com/memser-spaceport/pl-infra-pipeline/](https://github.com/memser-spaceport/pl-infra-pipeline/)

**Core Activities Handled by pl-infra-pipeline:**
- **Infrastructure Provisioning**: AWS VPC, EKS clusters, RDS, ElastiCache, SQS setup
- **Network Configuration**: Subnets, security groups, load balancers, DNS management
- **Secrets Management**: SSM Parameter Store integration and Kubernetes secrets sync
- **Deployment Automation**: Helm charts and Kubernetes manifest generation
- **Environment Management**: Multi-environment (dev/uat/prod) infrastructure support
- **Security Framework**: IAM policies, security groups, and access controls
- **Monitoring Infrastructure**: CloudWatch integration and logging setup

**Integration Model**: Services like `directory-service` **consume this infrastructure** by:
1. **Leveraging existing infrastructure** (EKS clusters, databases, etc.)
2. **Using provided Helm charts** for Kubernetes deployment
3. **Following established patterns** for secrets management and configuration
4. **Plugging into the deployment pipeline** through GitHub Actions workflows

The **pl-infra-pipeline** repository provides:

- **Terraform Modules**: Infrastructure as Code for AWS resources (manual provisioning)
- **Helm Charts**: Kubernetes deployment templates (automated deployment)
- **Config Generation**: Python scripts for SSM → Kubernetes secrets sync (automated)
- **Environment Management**: Multi-environment infrastructure support

**Important**: While this repository contains Terraform modules for infrastructure provisioning, the actual infrastructure deployment is **manual** and requires running `terraform apply` commands. Only the application deployment to existing infrastructure is automated.

**📚 For detailed information**: Refer to the [pl-infra-pipeline README](https://github.com/memser-spaceport/pl-infra-pipeline/) for comprehensive documentation on infrastructure components, Terraform modules, and integration patterns.

### 5.2 Shared Responsibility Model

The deployment process involves shared responsibilities between the **protocol-labs-network** repository and the **pl-infra-pipeline** repository. Understanding these boundaries is crucial for effective collaboration and troubleshooting.

#### Directory Service Repository Responsibilities

**Application Development & Containerization:**
- ✅ **Application Code**: Business logic, API endpoints, service implementation
- ✅ **Docker Configuration**: Dockerfile, container build process, image optimization
- ✅ **Application Dependencies**: Service-specific packages, libraries, and frameworks
- ✅ **Environment Configuration**: Application-level environment variables and settings

**Deployment Pipeline Configuration:**
- ✅ **GitHub Actions Workflows**: Environment-specific deployment automation
- ✅ **Docker Image Management**: Build, tag, and push to ECR with proper versioning
- ✅ **Environment Variables**: Setting ENVIRONMENT, APPNAME, APP_MODE values
- ✅ **Service-Specific Configuration**: Helm values and deployment parameters

**Secrets & Configuration Management:**
- ✅ **SSM Parameter Creation**: Service-specific parameters in Parameter Store
- ✅ **Environment-Specific Values**: Different configurations per environment (dev/uat/prod)
- ✅ **Service Secrets**: Database URLs, API keys, external service configurations
- ✅ **Domain & Ingress Configuration**: Service-specific hostnames and routing rules

**Application Monitoring & Maintenance:**
- ✅ **Application Health Checks**: Health endpoints and monitoring
- ✅ **Application Logging**: Service-specific log formats and levels
- ✅ **Performance Monitoring**: Application metrics and custom dashboards
- ✅ **Error Handling**: Application-level error management and reporting

#### pl-infra-pipeline Repository Responsibilities

**Infrastructure Provisioning & Management:**
- ✅ **AWS Infrastructure**: VPC, EKS clusters, RDS, ElastiCache, SQS provisioning
- ✅ **Terraform Modules**: Reusable infrastructure components and modules
- ✅ **Network Configuration**: Subnets, security groups, load balancers, DNS
- ✅ **Database Management**: RDS instances, configurations, and maintenance
- ✅ **Caching Infrastructure**: ElastiCache clusters and configurations

**Deployment Automation Framework:**
- ✅ **Helm Charts**: Kubernetes deployment templates and manifests
- ✅ **Configuration Generation**: Python scripts for SSM → Kubernetes secrets sync
- ✅ **Poetry Dependencies**: Python package management for config generation
- ✅ **Kubernetes Manifests**: Deployment, service, ingress, secret templates

**Secrets Management Framework:**
- ✅ **SSM Parameter Store Structure**: Hierarchical parameter organization
- ✅ **Automated Secrets Sync**: Python scripts for parameter retrieval and conversion
- ✅ **Kubernetes Secrets**: Automatic generation from SSM parameters
- ✅ **Environment Separation**: Multi-environment secrets management

**Infrastructure Monitoring & Security:**
- ✅ **Infrastructure Monitoring**: EKS cluster health, node status, resource utilization
- ✅ **Security Groups**: Network-level security and access controls
- ✅ **IAM Policies**: Service-specific permissions and roles
- ✅ **Backup Management**: RDS backups, disaster recovery procedures

### 5.3 Integration Process

#### Step 1: Infrastructure Repository Checkout
```yaml
- name: Checkout infrastructure repository
  uses: actions/checkout@v4
  with:
    repository: 'memser-spaceport/pl-infra-pipeline'
    ref: 'prod_release_v2'
    token: ${{ secrets.GIT_TOKEN }}
    path: './'
```

#### Step 2: Configuration Generation
```yaml
- name: Config generator
  run: |
    poetry run python main.py APPNAME=${{ env.APPNAME }} ENVIRONMENT=${{ env.ENVIRONMENT }} APP_MODE=${{ env.APP_MODE }}
  working-directory: ./deployment/config_gen
```

#### Step 3: Helm Deployment
```yaml
- name: Deploy using Helm
  run: |
    helm upgrade --install directory-service deployment/chart/ \
      --set image.repository=$ECR_REGISTRY \
      --set image.tag=$git_hash \
      --set nodeSelector.allocationtags=$NODE_SELECTOR \
      --set ingress.host=$DOMAIN \
      --set ingress.acm_arn=$CERT_ARN \
      -f deployment/chart/${{ env.APP_MODE }}_secret_values.yaml \
      -n $NAMESPACE
```

### 5.4 Required Environment Variables

| Variable | Description | Example Values |
|----------|-------------|----------------|
| `ENVIRONMENT` | Target environment | `dev`, `uat`, `prod` |
| `APPNAME` | Service name | `directory-service` |
| `APP_MODE` | Helm values file prefix | `directory_service` |
| `CLUSTER_NAME` | EKS cluster name | `preprod-pln`, `prod-pln` |
| `ECR_REPOSITORY` | Container registry name | `pln-directory-service` |
| `DOCKER_IMAGE` | Docker image name | `directory-service` |

---

## 6. Secrets Management

### 6.1 SSM Parameter Store Structure

Secrets are stored in AWS SSM Parameter Store with the following hierarchy:

```
/{ENVIRONMENT}/{SERVICE_NAME}/
├── database_url
├── redis_url
├── jwt_secret
├── aws_access_key_id
├── aws_secret_access_key
├── github_token
├── vercel_token
└── external_service_configs
```

**Example Paths**:
- Development: `/dev/directory-service/`
- UAT: `/uat/directory-service/`
- Production: `/prod/directory-service/`

### 6.2 Automated Secrets Sync

**Ownership**: The `deployment/config_gen/main.py` script is **owned and maintained by the pl-infra-pipeline repository**.

**SSM Parameter Path Requirements**: The SSM Parameter Store path must match the environment variables passed to the pl-infra-pipeline:
- **Path Format**: `/{ENVIRONMENT}/{APPNAME}/`
- **Example**: If `ENVIRONMENT=prod` and `APPNAME=directory-service`, then parameters must be stored under `/prod/directory-service/`

The `deployment/config_gen/main.py` script automatically:

1. **Fetches** all parameters from SSM Parameter Store under the specified path
2. **Converts** them to Kubernetes secrets
3. **Updates** Helm chart values file
4. **Maintains** environment separation
5. **Loads** all parameters as environment variables in the application container

**Important**: The auto-sync process is **managed by pl-infra-pipeline** and runs during the deployment workflow. The directory-service team is responsible for creating and maintaining the SSM parameters, but the sync mechanism is owned by the infrastructure team.

### 6.3 Adding New Secrets

To add a new secret:

1. **Add to SSM Parameter Store** (Directory Service Team Responsibility):
```bash
aws ssm put-parameter \
  --name "/prod/directory-service/NEW_SECRET" \
  --value "secret_value" \
  --type "SecureString"
```

**Note**: The parameter name must follow the path format `/{ENVIRONMENT}/{APPNAME}/PARAMETER_NAME` to match the environment variables passed to pl-infra-pipeline.

2. **Redeploy the service** - The pl-infra-pipeline config generation script will automatically pick up the new parameter during deployment

### 6.4 Secret Types

| Type | Description | Usage |
|------|-------------|-------|
| `SecureString` | Encrypted secrets | Passwords, API keys, tokens |
| `String` | Plain text values | URLs, configuration values |
| `StringList` | Comma-separated values | Lists, arrays |

---

## 7. GitHub Secrets Configuration

### 7.1 Required GitHub Secrets

The following secrets must be configured in the GitHub repository settings:

| Secret Name | Description | Required For |
|-------------|-------------|--------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM user access key | All environments |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM user secret key | All environments |
| `GIT_TOKEN` | GitHub personal access token | Infrastructure checkout |

### 7.2 AWS IAM Permissions

The AWS credentials must have the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:*",
        "eks:*",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:DescribeParameters"
      ],
      "Resource": "*"
    }
  ]
}
```

### 7.3 GitHub Token Permissions

The `GIT_TOKEN` must have:
- **Repository access**: Read access to `memser-spaceport/pl-infra-pipeline`
- **Contents**: Read access to repository contents
- **Metadata**: Read access to repository metadata

### 7.4 Setting Up GitHub Secrets

1. **Navigate to Repository Settings**:
   - Go to your GitHub repository
   - Click on "Settings" tab
   - Click on "Secrets and variables" → "Actions"

2. **Add Repository Secrets**:
   - Click "New repository secret"
   - Enter the secret name and value
   - Click "Add secret"

3. **Verify Secrets**:
   - Ensure all required secrets are listed
   - Test access by running a deployment workflow

---

## 8. Deployment Workflows

### 8.1 Development Deployment

**File**: `.github/workflows/dev_eks_deployment.yaml`

**Trigger**: Push to `develop` branch

**Key Configuration**:
```yaml
env:
  ENVIRONMENT: dev
  APPNAME: directory-service
  CLUSTER_NAME: preprod-pln
  APP_MODE: directory_service

# Helm deployment command
helm upgrade --install directory-service deployment/chart/ \
  --set nodeSelector.allocationtags=pln-dev-k8s \
  --set ingress.host=dev-directory.plnetwork.io \
  -f deployment/chart/directory_service_secret_values.yaml \
  -n pln-dev
```

### 8.2 UAT Deployment

**File**: `.github/workflows/uat_eks_deployment.yaml`

**Trigger**: Push to `release/*` branches

**Key Configuration**:
```yaml
env:
  ENVIRONMENT: uat
  APPNAME: directory-service
  CLUSTER_NAME: preprod-pln
  APP_MODE: directory_service

# Helm deployment command
helm upgrade --install directory-service deployment/chart/ \
  --set nodeSelector.allocationtags=pln-uat-k8s \
  --set ingress.host=api-uat-directory.plnetwork.io \
  -f deployment/chart/directory_service_secret_values.yaml \
  -n pln-uat
```

### 8.3 Production Deployment

**File**: `.github/workflows/prod_eks_deployment.yaml`

**Trigger**: Push to `main` branch or manual dispatch

**Key Configuration**:
```yaml
env:
  ENVIRONMENT: prod
  APPNAME: directory-service
  CLUSTER_NAME: prod-pln
  APP_MODE: directory_service

# Helm deployment command
helm upgrade --install directory-service deployment/chart/ \
  --set nodeSelector.allocationtags=pln-k8s \
  --set ingress.host=api-directory.plnetwork.io \
  -f deployment/chart/directory_service_secret_values.yaml \
  -n pln-prod
```

### 8.4 Workflow Execution Flow

The deployment workflow follows this sequence:

#### Branch-Based Triggering
- **develop branch** → Development Workflow
- **release/* branches** → UAT Workflow  
- **main branch** → Production Workflow

#### Common Execution Steps
1. **Code Push** → Workflow triggered based on branch
2. **Build & Push to ECR** → Docker image built and pushed to container registry
3. **Checkout Infrastructure** → pl-infra-pipeline repository cloned
4. **Generate Config from SSM** → Secrets synced from Parameter Store
5. **Deploy with Helm** → Application deployed to Kubernetes
6. **Verify Deployment** → Health checks and status verification

#### Environment-Specific Variations
- **Development**: Deploys to preprod cluster with dev node selector
- **UAT**: Deploys to preprod cluster with UAT node selector
- **Production**: Deploys to dedicated production cluster

---

## 9. Manual Deployment

### 9.1 Prerequisites

Before manual deployment, ensure you have:

- **AWS CLI** configured with appropriate credentials
- **kubectl** configured for the target cluster
- **Helm** installed (version 3.x)
- **Docker** for building images
- **Python 3.10+** with Poetry for config generation

### 9.2 Manual Deployment Steps

#### Step 1: Build and Push Docker Image
```bash
# Build the image
docker build -t directory-service .

# Get ECR registry URL
ECR_REGISTRY=$(aws ecr describe-repositories \
  --repository-names pln-directory-service \
  --query 'repositories[0].repositoryUri' \
  --output text)

# Tag the image
docker tag directory-service:latest $ECR_REGISTRY:manual-$(date +%Y%m%d-%H%M%S)

# Push to ECR
docker push $ECR_REGISTRY:manual-$(date +%Y%m%d-%H%M%S)
```

#### Step 2: Checkout Infrastructure Repository
```bash
git clone https://github.com/memser-spaceport/pl-infra-pipeline.git
cd pl-infra-pipeline
git checkout prod_release_v2
```

#### Step 3: Generate Configuration
```bash
cd deployment/config_gen
poetry install --no-root

# Set environment variables
export ENVIRONMENT=prod  # or dev/uat
export APPNAME=directory-service
export APP_MODE=directory_service

# Generate config
poetry run python main.py APPNAME=$APPNAME ENVIRONMENT=$ENVIRONMENT APP_MODE=$APP_MODE
```

#### Step 4: Deploy with Helm
```bash
cd ../chart

# Get certificate ARN
CERT_ARN=$(aws ssm get-parameter \
  --name "/pln/acm/config" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text)

# Deploy
helm upgrade --install directory-service ./ \
  --set image.repository=$ECR_REGISTRY \
  --set image.tag=manual-$(date +%Y%m%d-%H%M%S) \
  --set nodeSelector.allocationtags=pln-k8s \
  --set ingress.host=api-directory.plnetwork.io \
  --set ingress.acm_arn=$CERT_ARN \
  -f directory_service_secret_values.yaml \
  -n pln-prod
```

### 9.3 Verification

After deployment, verify the service is running:

```bash
# Check pod status
kubectl get pods -n pln-prod -l app.kubernetes.io/name=directory-service

# Check service status
kubectl get svc -n pln-prod -l app.kubernetes.io/name=directory-service

# Check ingress
kubectl get ingress -n pln-prod -l app.kubernetes.io/name=directory-service

# View logs
kubectl logs -f deployment/directory-service -n pln-prod
```

---

## 10. Troubleshooting

### 10.1 Common Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **SSM Parameters Not Found** | Service fails to start, missing environment variables | Check parameter path format: `/{ENV}/{SERVICE}/` |
| **ECR Image Pull Failed** | Pods in ImagePullBackOff state | Verify ECR repository exists and image was pushed |
| **Helm Deployment Failed** | Helm command fails with errors | Check Helm chart values and Kubernetes cluster access |
| **Service Not Accessible** | 404 or connection refused | Verify ingress configuration and DNS settings |
| **Resource Limits Exceeded** | Pods in Pending state | Increase node capacity or optimize resource requests |

### 10.2 Debug Commands

#### Check SSM Parameters
```bash
# List all parameters for the service
aws ssm get-parameters-by-path \
  --path "/prod/directory-service/" \
  --recursive

# Get specific parameter
aws ssm get-parameter \
  --name "/prod/directory-service/database_url" \
  --with-decryption
```

#### Check Kubernetes Resources
```bash
# Check pod status
kubectl get pods -n pln-prod -l app.kubernetes.io/name=directory-service

# Describe pod for detailed info
kubectl describe pod <pod-name> -n pln-prod

# Check pod logs
kubectl logs <pod-name> -n pln-prod

# Check secrets
kubectl get secrets -n pln-prod
kubectl describe secret directory-service-secret -n pln-prod
```

#### Check Helm Deployment
```bash
# List Helm releases
helm list -n pln-prod

# Get release status
helm status directory-service -n pln-prod

# Get release values
helm get values directory-service -n pln-prod
```

### 10.3 Log Analysis

#### Application Logs
```bash
# Follow logs in real-time
kubectl logs -f deployment/directory-service -n pln-prod

# Get logs from specific time
kubectl logs deployment/directory-service -n pln-prod --since=1h

# Get logs from all containers
kubectl logs deployment/directory-service -n pln-prod --all-containers=true
```

#### Infrastructure Logs
```bash
# Check EKS control plane logs
aws logs describe-log-groups --log-group-name-prefix /aws/eks/preprod-pln

# Check application logs in CloudWatch
aws logs describe-log-groups --log-group-name-prefix /aws/eks/directory-service
```

---

## 11. Monitoring and Maintenance

### 11.1 Health Checks

The application includes comprehensive health check endpoints:

- **Health Endpoint**: `GET /health` - Comprehensive health check with multiple indicators
- **Readiness Probe**: Kubernetes readiness check
- **Liveness Probe**: Kubernetes liveness check

#### Health Check Components

The `/health` endpoint performs the following checks:

1. **Database Health**: Prisma connection test with `SELECT 1` query
3. **HTTP Response**: Returns detailed health status for each component

**Note**: The health endpoint is excluded from caching and metrics collection for accurate monitoring.

### 11.2 Monitoring Stack

| Component | Purpose | Access |
|-----------|---------|--------|
| **CloudWatch** | Application logs and metrics | AWS Console |
| **EKS Control Plane** | Kubernetes cluster logs | AWS Console |
| **Application Metrics** | Custom application metrics | CloudWatch Dashboards |
| **ALB Access Logs** | Load balancer access logs | S3 Bucket |

---
