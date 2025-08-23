# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-environment, multi-region ECS deployment using AWS CDK TypeScript. The project deploys containerized applications to ECS Fargate with Application Load Balancers, CodeDeploy for blue/green deployments, and Route53 DNS records.

## Environment Configuration

The project supports three environments with different regional deployments:

- **dev**: us-east-1 only
- **qa**: us-east-1, us-west-2
- **prod**: us-east-1, us-west-2

Configuration is centralized in `lib/config/environment-config.ts` with region-specific resources (VPC, subnets, security groups, certificates).

## Common Development Commands

### Build and Test

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and compile
- `npm run test` - Run Jest unit tests
- `npm run cdk synth` - Synthesize CloudFormation templates

### Linting and Formatting

- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Run ESLint and automatically fix issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is formatted correctly

### Deployment Commands

Deploy to specific environment (replace `<env>` with dev/qa/prod):

**High-Level Constructs (default):**
- `npx cdk deploy --all -c environment=<env>` - Deploy all stacks for environment
- `npx cdk diff -c environment=<env>` - Compare deployed stack with current state
- `npx cdk destroy --all -c environment=<env>` - Destroy all stacks for environment

**Low-Level CFN Constructs:**
- `npx cdk deploy --all -c environment=<env> -c stackType=cfn` - Deploy CFN stacks
- `npx cdk diff -c environment=<env> -c stackType=cfn` - Compare CFN stack changes
- `npx cdk destroy --all -c environment=<env> -c stackType=cfn` - Destroy CFN stacks

### Environment-specific examples:

**High-Level Stacks:**
- `npx cdk deploy --all -c environment=dev` - Deploy dev (us-east-1 only)
- `npx cdk deploy --all -c environment=qa` - Deploy qa (us-east-1, us-west-2)
- `npx cdk deploy --all -c environment=prod` - Deploy prod (us-east-1, us-west-2)

**CFN Stacks:**
- `npx cdk deploy --all -c environment=dev -c stackType=cfn` - Deploy dev CFN stacks
- `npx cdk deploy --all -c environment=qa -c stackType=cfn` - Deploy qa CFN stacks
- `npx cdk deploy --all -c environment=prod -c stackType=cfn` - Deploy prod CFN stacks

## Architecture

### Stack Structure

- **EcsServiceStack**: High-level construct stack with convenience methods (default)
- **EcsServiceCfnStack**: Low-level CloudFormation construct stack for full control
- **Environment Configuration**: Centralized config with per-region resource definitions
- **Main App**: `bin/ecs-service-app.ts` - Entry point that creates stacks for all configured regions

### Stack Type Comparison

**High-Level Constructs (EcsServiceStack):**
- ✅ **Recommended for most use cases**
- ✅ Built-in best practices and sensible defaults
- ✅ Convenience methods (autoScaleTaskCount, attachToApplicationTargetGroup)
- ✅ Faster development with less boilerplate
- ✅ Automatic dependency management
- ❌ Less granular control over CloudFormation properties

**Low-Level CFN Constructs (EcsServiceCfnStack):**
- ⚙️ **Use when you need full control**
- ✅ 1:1 mapping to CloudFormation resources
- ✅ Access to all CloudFormation properties
- ✅ Explicit dependency management
- ✅ Easier migration from existing CloudFormation
- ❌ More verbose and requires manual configuration
- ❌ No convenience methods or built-in best practices

### Key Components

- **ECS Fargate Service**: Containerized application with auto-scaling
- **Application Load Balancer**: HTTPS termination with health checks
- **CodeDeploy**: Blue/green deployment strategy
- **Route53**: DNS records pointing to ALB
- **CloudWatch**: Logging and monitoring

### Resource Naming Convention

Resources are named with pattern: `{appName}-{environment}-{resource-type}-{region}`

**Resource Examples:**
- **ECS Cluster**: `mcp-gw-dev-cluster-us-east-1`
- **ALB**: `mcp-gw-prod-alb-us-west-2`
- **Target Groups**: `mcp-gw-qa-green-tg-us-east-1`, `mcp-gw-qa-blue-tg-us-east-1`
- **ECS Service**: `mcp-gw-dev-service-us-east-1`
- **Task Definition**: `mcp-gw-prod-task-us-west-2`
- **CodeDeploy App**: `mcp-gw-qa-codedeploy-us-east-1`
- **CloudWatch Logs**: `/ecs/mcp-gw-dev-service-us-east-1`
- **Route53 Records**: `mcp-gw-prod-us-west-2.yourdomain.com`
- **CDK Stacks**: `mcp-gw-dev-us-east-1`, `mcp-gw-prod-us-west-2`

The `appName` is configurable in the environment configuration and defaults to "mcp-gw".

## Configuration Requirements

Before deployment, update `lib/config/environment-config.ts` with actual values:

- App name (defaults to "mcp-gw")
- VPC IDs for each environment/region
- Subnet IDs (private subnets recommended)
- Security Group IDs
- Certificate ARNs (must be in same region as deployment)
- IAM Role ARNs
- Domain names and Hosted Zone IDs
- Container image URIs
- Container environment variables for each environment

## Container Requirements

The application container must:

- Listen on port 8000 (configurable in environment config)
- Provide health check endpoint at `/ready/status` (configurable)
- Return HTTP 200 for healthy status

### Environment Variables

Each container receives these environment variables:

**System Variables** (automatically set):
- `ENVIRONMENT`: The deployment environment (dev/qa/prod)
- `REGION`: The AWS region where the container is running

**Custom Variables** (configured per environment):
- `NODE_ENV`: Application environment mode
- `LOG_LEVEL`: Logging verbosity level
- `API_VERSION`: API version identifier
- `DATABASE_POOL_SIZE`: Database connection pool size
- `CACHE_TTL`: Cache time-to-live in seconds
- `ENABLE_METRICS`: Enable metrics collection (qa/prod only)
- `PERFORMANCE_MONITORING`: Enable performance monitoring (prod only)

Additional custom environment variables can be added in `containerEnvironmentVariables` for each environment in the configuration file.

## Auto Scaling

Configured with:

- CPU utilization scaling (target: 70%)
- Memory utilization scaling (target: 80%)
- Environment-specific min/max capacity limits

## Security

- All traffic encrypted in transit (HTTPS only)
- HTTP requests redirect to HTTPS
- Private subnets recommended for ECS tasks
- Security groups control network access
- IAM roles follow least privilege principle
