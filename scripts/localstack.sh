#!/bin/bash

# LocalStack management script for MCP Gateway
# Usage: ./scripts/localstack.sh [command]
# Commands: start, stop, restart, deploy, destroy, status, logs, init

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_DIR/.env.localstack" ]; then
    set -a
    source "$PROJECT_DIR/.env.localstack"
    set +a
fi

COMMAND=${1:-help}

# Function to check if LocalStack is running
check_localstack() {
    if curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to wait for LocalStack to be ready
wait_for_localstack() {
    echo "Waiting for LocalStack to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if check_localstack; then
            echo "LocalStack is ready!"
            return 0
        fi
        
        echo "Attempt $attempt/$max_attempts: LocalStack not ready yet..."
        sleep 5
        ((attempt++))
    done
    
    echo "LocalStack failed to start within expected time"
    return 1
}

# Function to initialize LocalStack resources
init_localstack() {
    echo "Initializing LocalStack resources..."
    
    # Set AWS CLI to use LocalStack
    export AWS_ENDPOINT_URL=http://localhost:4566
    export AWS_DEFAULT_REGION=us-east-1
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    
    # Create default VPC and networking resources
    echo "Creating default VPC and networking..."
    aws ec2 create-default-vpc --endpoint-url=http://localhost:4566 || true
    
    # Create security group
    echo "Creating security group..."
    aws ec2 create-security-group \
        --group-name default-sg \
        --description "Default security group for LocalStack" \
        --endpoint-url=http://localhost:4566 || true
    
    # Add ingress rules
    aws ec2 authorize-security-group-ingress \
        --group-id sg-12345678 \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --endpoint-url=http://localhost:4566 || true
        
    aws ec2 authorize-security-group-ingress \
        --group-id sg-12345678 \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --endpoint-url=http://localhost:4566 || true
        
    aws ec2 authorize-security-group-ingress \
        --group-id sg-12345678 \
        --protocol tcp \
        --port 8000 \
        --cidr 0.0.0.0/0 \
        --endpoint-url=http://localhost:4566 || true
    
    # Create IAM role for ECS tasks
    echo "Creating IAM role..."
    aws iam create-role \
        --role-name ecs-task-role \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "ecs-tasks.amazonaws.com"
                    },
                    "Action": "sts:AssumeRole"
                }
            ]
        }' \
        --endpoint-url=http://localhost:4566 || true
    
    # Attach policies to the role
    aws iam attach-role-policy \
        --role-name ecs-task-role \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
        --endpoint-url=http://localhost:4566 || true
    
    # Create ACM certificate
    echo "Creating ACM certificate..."
    aws acm request-certificate \
        --domain-name "*.mcp-gw.com" \
        --subject-alternative-names "mcp-gw.com" \
        --validation-method DNS \
        --endpoint-url=http://localhost:4566 || true
    
    # Create Route53 hosted zone
    echo "Creating Route53 hosted zone..."
    aws route53 create-hosted-zone \
        --name mcp-gw.com \
        --caller-reference $(date +%s) \
        --endpoint-url=http://localhost:4566 || true
    
    echo "LocalStack initialization completed!"
}

# Function to build sample app
build_sample_app() {
    echo "Building sample application..."
    cd "$PROJECT_DIR/localstack/sample-app"
    
    # Install dependencies if package-lock.json doesn't exist
    if [ ! -f package-lock.json ]; then
        npm install
    fi
    
    # Build Docker image
    docker build -t mcp-gw-sample-app:latest .
    
    echo "Sample application built successfully!"
    cd "$PROJECT_DIR"
}

case $COMMAND in
    start)
        echo "Starting LocalStack..."
        cd "$PROJECT_DIR"
        docker-compose --env-file .env.localstack up -d localstack
        wait_for_localstack
        ;;
        
    start-ui)
        echo "Starting LocalStack with GUI..."
        cd "$PROJECT_DIR"
        docker-compose --env-file .env.localstack --profile ui up -d
        wait_for_localstack
        echo "LocalStack GUIs available:"
        echo "  - Built-in Web UI: http://localhost:4566/_localstack/cockpit"
        echo "  - LocalStack UI: http://localhost:8080"
        echo "  - AWS CLI Web: http://localhost:8081"
        ;;
        
    stop)
        echo "Stopping LocalStack..."
        cd "$PROJECT_DIR"
        docker-compose --env-file .env.localstack down
        ;;
        
    restart)
        echo "Restarting LocalStack..."
        cd "$PROJECT_DIR"
        docker-compose --env-file .env.localstack restart localstack
        wait_for_localstack
        ;;
        
    status)
        if check_localstack; then
            echo "LocalStack is running"
            curl -s http://localhost:4566/_localstack/health | jq '.' || echo "LocalStack is running but health endpoint not responding properly"
        else
            echo "LocalStack is not running"
        fi
        ;;
        
    logs)
        echo "Showing LocalStack logs..."
        cd "$PROJECT_DIR"
        docker-compose --env-file .env.localstack logs -f localstack
        ;;
        
    init)
        if ! check_localstack; then
            echo "LocalStack is not running. Starting LocalStack first..."
            cd "$PROJECT_DIR"
            docker-compose --env-file .env.localstack up -d localstack
            wait_for_localstack
        fi
        init_localstack
        ;;
        
    build)
        build_sample_app
        ;;
        
    deploy)
        echo "Deploying to LocalStack..."
        
        if ! check_localstack; then
            echo "LocalStack is not running. Starting LocalStack first..."
            cd "$PROJECT_DIR"
            docker-compose --env-file .env.localstack up -d localstack
            wait_for_localstack
            init_localstack
        fi
        
        # Build sample app
        build_sample_app
        
        # Deploy with CDK
        cd "$PROJECT_DIR"
        source .env.localstack
        
        echo "Deploying CDK stack to LocalStack..."
        cdklocal deploy --all -c environment=local --require-approval never
        ;;
        
    destroy)
        echo "Destroying LocalStack deployment..."
        cd "$PROJECT_DIR"
        source .env.localstack
        cdklocal destroy --all -c environment=local --force
        ;;
        
    help|*)
        echo "LocalStack management script for MCP Gateway"
        echo
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  start      - Start LocalStack services"
        echo "  start-ui   - Start LocalStack with GUI interfaces"
        echo "  stop       - Stop LocalStack services"
        echo "  restart    - Restart LocalStack services"
        echo "  status     - Check LocalStack status"
        echo "  logs       - Show LocalStack logs"
        echo "  init       - Initialize LocalStack resources (VPC, IAM, etc.)"
        echo "  build      - Build sample application Docker image"
        echo "  deploy     - Deploy CDK stack to LocalStack"
        echo "  destroy    - Destroy CDK stack in LocalStack"
        echo "  help       - Show this help message"
        ;;
esac