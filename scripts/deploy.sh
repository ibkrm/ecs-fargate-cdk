#!/bin/bash

# Deployment script for ECS CDK project
# Usage: ./scripts/deploy.sh <environment> [action] [stackType]
# Environment: dev, qa, prod
# Action: deploy (default), diff, destroy, synth
# StackType: high-level (default), cfn

set -e

ENVIRONMENT=$1
ACTION=${2:-deploy}
STACK_TYPE=${3:-high-level}

if [ -z "$ENVIRONMENT" ]; then
    echo "Usage: $0 <environment> [action] [stackType]"
    echo "Environment: dev, qa, prod"
    echo "Action: deploy (default), diff, destroy, synth"
    echo "StackType: high-level (default), cfn"
    exit 1
fi

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "qa" && "$ENVIRONMENT" != "prod" ]]; then
    echo "Error: Environment must be one of: dev, qa, prod"
    exit 1
fi

if [[ "$STACK_TYPE" != "high-level" && "$STACK_TYPE" != "cfn" ]]; then
    echo "Error: Stack type must be one of: high-level, cfn"
    exit 1
fi

STACK_TYPE_PARAM=""
if [[ "$STACK_TYPE" == "cfn" ]]; then
    STACK_TYPE_PARAM="-c stackType=cfn"
fi

echo "Running CDK $ACTION for environment: $ENVIRONMENT (stack type: $STACK_TYPE)"

case $ACTION in
    deploy)
        npx cdk deploy --all -c environment=$ENVIRONMENT $STACK_TYPE_PARAM --require-approval never
        ;;
    diff)
        npx cdk diff -c environment=$ENVIRONMENT $STACK_TYPE_PARAM
        ;;
    destroy)
        npx cdk destroy --all -c environment=$ENVIRONMENT $STACK_TYPE_PARAM --force
        ;;
    synth)
        npx cdk synth -c environment=$ENVIRONMENT $STACK_TYPE_PARAM
        ;;
    *)
        echo "Error: Invalid action. Must be one of: deploy, diff, destroy, synth"
        exit 1
        ;;
esac