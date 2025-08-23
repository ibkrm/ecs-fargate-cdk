#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EcsServiceStack } from '../lib/ecs-service-stack';
import { EcsServiceCfnStack } from '../lib/ecs-service-cfn-stack';
import { environments } from '../lib/config/environment-config';

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environmentName = app.node.tryGetContext('environment') || 'dev';
const environmentConfig = environments[environmentName];

// Get stack type from context - 'high-level' (default) or 'cfn'
const stackType = app.node.tryGetContext('stackType') || 'high-level';

if (!environmentConfig) {
  throw new Error(`Environment '${environmentName}' not found in configuration`);
}

if (!['high-level', 'cfn'].includes(stackType)) {
  throw new Error(`Stack type '${stackType}' not supported. Use 'high-level' or 'cfn'`);
}

// Deploy to all regions for the specified environment
Object.values(environmentConfig.regions).forEach((regionConfig) => {
  const stackSuffix = stackType === 'cfn' ? '-cfn' : '';
  const stackId = `${environmentConfig.appName}-${environmentConfig.environment}-${regionConfig.region}${stackSuffix}`;

  if (stackType === 'cfn') {
    // Deploy using low-level CFN constructs
    new EcsServiceCfnStack(app, stackId, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: regionConfig.region,
      },
      environmentConfig,
      regionConfig,
    });
  } else {
    // Deploy using high-level constructs (default)
    new EcsServiceStack(app, stackId, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: regionConfig.region,
      },
      environmentConfig,
      regionConfig,
    });
  }
});
