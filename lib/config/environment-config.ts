export interface RegionConfig {
  region: string;
  vpcId: string;
  subnetIds: string[];
  securityGroupIds: string[];
  certificateArn: string;
  hostedZoneId: string;
}

export interface EnvironmentConfig {
  appName: string;
  environment: string;
  regions: { [region: string]: RegionConfig };
  iamRoleArn: string;
  domainName: string;
  containerImage: string;
  containerPort: number;
  healthCheckPath: string;
  minCapacity: number;
  maxCapacity: number;
  desiredCount: number;
  cpu: number;
  memory: number;
  containerEnvironmentVariables: { [key: string]: string };
}

export const environments: { [key: string]: EnvironmentConfig } = {
  local: {
    appName: 'mcp-gw',
    environment: 'local',
    regions: {
      'us-east-1': {
        region: 'us-east-1',
        vpcId: 'vpc-12345678', // LocalStack default VPC
        subnetIds: ['subnet-12345678', 'subnet-87654321'], // LocalStack default subnets
        securityGroupIds: ['sg-ae374e9b657d70aa0'], // LocalStack created security group
        certificateArn: 'arn:aws:acm:us-east-1:000000000000:certificate/d332aa69-965b-4973-b83d-67fec57413a7', // LocalStack created certificate
        hostedZoneId: '0SQTVEPGW0AFBRL', // LocalStack created hosted zone
      },
    },
    iamRoleArn: 'arn:aws:iam::000000000000:role/ecs-task-role', // LocalStack created IAM role
    domainName: 'local.mcp-gw.com',
    containerImage: 'mcp-gw-sample-app:latest', // Local Docker image
    containerPort: 8000,
    healthCheckPath: '/ready/status',
    minCapacity: 1,
    maxCapacity: 2,
    desiredCount: 1,
    cpu: 256,
    memory: 512,
    containerEnvironmentVariables: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      API_VERSION: 'v1',
      DATABASE_POOL_SIZE: '2',
      CACHE_TTL: '60',
    },
  },
  dev: {
    appName: 'mcp-gw',
    environment: 'dev',
    regions: {
      'us-east-1': {
        region: 'us-east-1',
        vpcId: 'vpc-dev-us-east-1-xxxxxxxxx', // Replace with your dev VPC ID in us-east-1
        subnetIds: ['subnet-dev-us-east-1-xxxxxxxxx', 'subnet-dev-us-east-1-yyyyyyyyy'], // Replace with dev subnet IDs in us-east-1
        securityGroupIds: ['sg-dev-us-east-1-xxxxxxxxx'], // Replace with dev security group IDs in us-east-1
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/dev-xxxxxxxxx', // Replace with dev certificate ARN in us-east-1
        hostedZoneId: 'Z1234567890123', // Replace with dev hosted zone ID
      },
    },
    iamRoleArn: 'arn:aws:iam::123456789012:role/dev-ecs-task-role', // Replace with your dev IAM role ARN
    domainName: 'dev.yourdomain.com', // Replace with your dev domain
    containerImage: 'your-ecr-repo:dev-latest', // Replace with your dev container image
    containerPort: 8000,
    healthCheckPath: '/ready/status',
    minCapacity: 1,
    maxCapacity: 5,
    desiredCount: 2,
    cpu: 256,
    memory: 512,
    containerEnvironmentVariables: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      API_VERSION: 'v1',
      DATABASE_POOL_SIZE: '5',
      CACHE_TTL: '300',
    },
  },
  qa: {
    appName: 'mcp-gw',
    environment: 'qa',
    regions: {
      'us-east-1': {
        region: 'us-east-1',
        vpcId: 'vpc-qa-us-east-1-xxxxxxxxx', // Replace with your qa VPC ID in us-east-1
        subnetIds: ['subnet-qa-us-east-1-xxxxxxxxx', 'subnet-qa-us-east-1-yyyyyyyyy'], // Replace with qa subnet IDs in us-east-1
        securityGroupIds: ['sg-qa-us-east-1-xxxxxxxxx'], // Replace with qa security group IDs in us-east-1
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/qa-xxxxxxxxx', // Replace with qa certificate ARN in us-east-1
        hostedZoneId: 'Z1234567890123', // Replace with qa hosted zone ID
      },
      'us-west-2': {
        region: 'us-west-2',
        vpcId: 'vpc-qa-us-west-2-xxxxxxxxx', // Replace with your qa VPC ID in us-west-2
        subnetIds: ['subnet-qa-us-west-2-xxxxxxxxx', 'subnet-qa-us-west-2-yyyyyyyyy'], // Replace with qa subnet IDs in us-west-2
        securityGroupIds: ['sg-qa-us-west-2-xxxxxxxxx'], // Replace with qa security group IDs in us-west-2
        certificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/qa-xxxxxxxxx', // Replace with qa certificate ARN in us-west-2
        hostedZoneId: 'Z1234567890123', // Replace with qa hosted zone ID
      },
    },
    iamRoleArn: 'arn:aws:iam::123456789012:role/qa-ecs-task-role', // Replace with your qa IAM role ARN
    domainName: 'qa.yourdomain.com', // Replace with your qa domain
    containerImage: 'your-ecr-repo:qa-latest', // Replace with your qa container image
    containerPort: 8000,
    healthCheckPath: '/ready/status',
    minCapacity: 2,
    maxCapacity: 10,
    desiredCount: 3,
    cpu: 512,
    memory: 1024,
    containerEnvironmentVariables: {
      NODE_ENV: 'staging',
      LOG_LEVEL: 'info',
      API_VERSION: 'v1',
      DATABASE_POOL_SIZE: '10',
      CACHE_TTL: '600',
      ENABLE_METRICS: 'true',
    },
  },
  prod: {
    appName: 'mcp-gw',
    environment: 'prod',
    regions: {
      'us-east-1': {
        region: 'us-east-1',
        vpcId: 'vpc-prod-us-east-1-xxxxxxxxx', // Replace with your prod VPC ID in us-east-1
        subnetIds: ['subnet-prod-us-east-1-xxxxxxxxx', 'subnet-prod-us-east-1-yyyyyyyyy'], // Replace with prod subnet IDs in us-east-1
        securityGroupIds: ['sg-prod-us-east-1-xxxxxxxxx'], // Replace with prod security group IDs in us-east-1
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/prod-xxxxxxxxx', // Replace with prod certificate ARN in us-east-1
        hostedZoneId: 'Z1234567890123', // Replace with prod hosted zone ID
      },
      'us-west-2': {
        region: 'us-west-2',
        vpcId: 'vpc-prod-us-west-2-xxxxxxxxx', // Replace with your prod VPC ID in us-west-2
        subnetIds: ['subnet-prod-us-west-2-xxxxxxxxx', 'subnet-prod-us-west-2-yyyyyyyyy'], // Replace with prod subnet IDs in us-west-2
        securityGroupIds: ['sg-prod-us-west-2-xxxxxxxxx'], // Replace with prod security group IDs in us-west-2
        certificateArn: 'arn:aws:acm:us-west-2:123456789012:certificate/prod-xxxxxxxxx', // Replace with prod certificate ARN in us-west-2
        hostedZoneId: 'Z1234567890123', // Replace with prod hosted zone ID
      },
    },
    iamRoleArn: 'arn:aws:iam::123456789012:role/prod-ecs-task-role', // Replace with your prod IAM role ARN
    domainName: 'prod.yourdomain.com', // Replace with your prod domain
    containerImage: 'your-ecr-repo:prod-latest', // Replace with your prod container image
    containerPort: 8000,
    healthCheckPath: '/ready/status',
    minCapacity: 5,
    maxCapacity: 20,
    desiredCount: 10,
    cpu: 1024,
    memory: 2048,
    containerEnvironmentVariables: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      API_VERSION: 'v1',
      DATABASE_POOL_SIZE: '20',
      CACHE_TTL: '900',
      ENABLE_METRICS: 'true',
      PERFORMANCE_MONITORING: 'true',
    },
  },
};
