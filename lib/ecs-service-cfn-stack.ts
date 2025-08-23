import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig, RegionConfig } from './config/environment-config';

export interface EcsServiceCfnStackProps extends cdk.StackProps {
  environmentConfig: EnvironmentConfig;
  regionConfig: RegionConfig;
}

export class EcsServiceCfnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsServiceCfnStackProps) {
    super(scope, id, props);

    const { environmentConfig, regionConfig } = props;

    // Import existing VPC (using lookup for subnets)
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: regionConfig.vpcId,
    });

    // Import existing subnets
    const subnets = regionConfig.subnetIds.map((subnetId, index) =>
      ec2.Subnet.fromSubnetId(this, `Subnet${index}`, subnetId)
    );

    // Create ECS Cluster using CfnCluster
    const cfnCluster = new ecs.CfnCluster(this, 'CfnCluster', {
      clusterName: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-cluster-${regionConfig.region}`,
      tags: [
        {
          key: 'Environment',
          value: environmentConfig.environment,
        },
        {
          key: 'AppName',
          value: environmentConfig.appName,
        },
      ],
    });

    // Create CloudWatch Log Group using CfnLogGroup
    const cfnLogGroup = new logs.CfnLogGroup(this, 'CfnLogGroup', {
      logGroupName: `/ecs/${environmentConfig.appName}-${environmentConfig.environment}-cfn-service-${regionConfig.region}`,
      retentionInDays: 7,
    });

    // Create Task Definition using CfnTaskDefinition
    const cfnTaskDefinition = new ecs.CfnTaskDefinition(this, 'CfnTaskDefinition', {
      family: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-task-${regionConfig.region}`,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: environmentConfig.cpu.toString(),
      memory: environmentConfig.memory.toString(),
      taskRoleArn: environmentConfig.iamRoleArn,
      executionRoleArn: environmentConfig.iamRoleArn,
      containerDefinitions: [
        {
          name: 'AppContainer',
          image: environmentConfig.containerImage,
          portMappings: [
            {
              containerPort: environmentConfig.containerPort,
              protocol: 'tcp',
            },
          ],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': cfnLogGroup.logGroupName!,
              'awslogs-region': regionConfig.region,
              'awslogs-stream-prefix': 'ecs',
            },
          },
          environment: [
            {
              name: 'ENVIRONMENT',
              value: environmentConfig.environment,
            },
            {
              name: 'REGION',
              value: regionConfig.region,
            },
            // Add custom environment variables
            ...Object.entries(environmentConfig.containerEnvironmentVariables).map(([name, value]) => ({
              name,
              value,
            })),
          ],
        },
      ],
    });

    // Create Application Load Balancer using CfnLoadBalancer
    const cfnLoadBalancer = new elbv2.CfnLoadBalancer(this, 'CfnLoadBalancer', {
      name: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-alb-${regionConfig.region}`,
      scheme: 'internet-facing',
      type: 'application',
      subnets: regionConfig.subnetIds,
      securityGroups: regionConfig.securityGroupIds,
      tags: [
        {
          key: 'Environment',
          value: environmentConfig.environment,
        },
        {
          key: 'AppName',
          value: environmentConfig.appName,
        },
      ],
    });

    // Create Green Target Group using CfnTargetGroup
    const cfnGreenTargetGroup = new elbv2.CfnTargetGroup(this, 'CfnGreenTargetGroup', {
      name: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-green-tg-${regionConfig.region}`,
      port: environmentConfig.containerPort,
      protocol: 'HTTP',
      targetType: 'ip',
      vpcId: regionConfig.vpcId,
      healthCheckEnabled: true,
      healthCheckPath: environmentConfig.healthCheckPath,
      healthCheckProtocol: 'HTTP',
      healthCheckIntervalSeconds: 30,
      healthCheckTimeoutSeconds: 5,
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
      matcher: {
        httpCode: '200',
      },
      tags: [
        {
          key: 'Environment',
          value: environmentConfig.environment,
        },
        {
          key: 'AppName',
          value: environmentConfig.appName,
        },
      ],
    });

    // Create Blue Target Group using CfnTargetGroup
    const cfnBlueTargetGroup = new elbv2.CfnTargetGroup(this, 'CfnBlueTargetGroup', {
      name: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-blue-tg-${regionConfig.region}`,
      port: environmentConfig.containerPort,
      protocol: 'HTTP',
      targetType: 'ip',
      vpcId: regionConfig.vpcId,
      healthCheckEnabled: true,
      healthCheckPath: environmentConfig.healthCheckPath,
      healthCheckProtocol: 'HTTP',
      healthCheckIntervalSeconds: 30,
      healthCheckTimeoutSeconds: 5,
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
      matcher: {
        httpCode: '200',
      },
      tags: [
        {
          key: 'Environment',
          value: environmentConfig.environment,
        },
        {
          key: 'AppName',
          value: environmentConfig.appName,
        },
      ],
    });

    // Create HTTPS Listener using CfnListener
    const cfnHttpsListener = new elbv2.CfnListener(this, 'CfnHttpsListener', {
      loadBalancerArn: cfnLoadBalancer.attrLoadBalancerArn,
      port: 443,
      protocol: 'HTTPS',
      certificates: [
        {
          certificateArn: regionConfig.certificateArn,
        },
      ],
      defaultActions: [
        {
          type: 'forward',
          targetGroupArn: cfnGreenTargetGroup.attrTargetGroupArn,
        },
      ],
    });

    // Create HTTP Listener (redirect to HTTPS) using CfnListener
    new elbv2.CfnListener(this, 'CfnHttpListener', {
      loadBalancerArn: cfnLoadBalancer.attrLoadBalancerArn,
      port: 80,
      protocol: 'HTTP',
      defaultActions: [
        {
          type: 'redirect',
          redirectConfig: {
            protocol: 'HTTPS',
            port: '443',
            statusCode: 'HTTP_301',
          },
        },
      ],
    });

    // Create ECS Service using CfnService
    const cfnService = new ecs.CfnService(this, 'CfnService', {
      serviceName: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-service-${regionConfig.region}`,
      cluster: cfnCluster.attrArn,
      taskDefinition: cfnTaskDefinition.attrTaskDefinitionArn,
      desiredCount: environmentConfig.desiredCount,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: regionConfig.subnetIds,
          securityGroups: regionConfig.securityGroupIds,
          assignPublicIp: 'DISABLED',
        },
      },
      loadBalancers: [
        {
          targetGroupArn: cfnGreenTargetGroup.attrTargetGroupArn,
          containerName: 'AppContainer',
          containerPort: environmentConfig.containerPort,
        },
      ],
      deploymentController: {
        type: 'CODE_DEPLOY',
      },
      enableExecuteCommand: true,
      tags: [
        {
          key: 'Environment',
          value: environmentConfig.environment,
        },
        {
          key: 'AppName',
          value: environmentConfig.appName,
        },
      ],
    });

    // Add dependencies
    cfnService.addDependency(cfnGreenTargetGroup);
    cfnService.addDependency(cfnHttpsListener);

    // Create Auto Scaling Target using CfnScalableTarget
    const cfnScalableTarget = new cdk.aws_applicationautoscaling.CfnScalableTarget(
      this,
      'CfnScalableTarget',
      {
        maxCapacity: environmentConfig.maxCapacity,
        minCapacity: environmentConfig.minCapacity,
        resourceId: `service/${cfnCluster.clusterName}/${cfnService.attrName}`,
        scalableDimension: 'ecs:service:DesiredCount',
        serviceNamespace: 'ecs',
      }
    );

    // Add dependency
    cfnScalableTarget.addDependency(cfnService);

    // Create CPU Scaling Policy using CfnScalingPolicy
    new cdk.aws_applicationautoscaling.CfnScalingPolicy(this, 'CfnCpuScalingPolicy', {
      policyName: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-cpu-scaling-${regionConfig.region}`,
      policyType: 'TargetTrackingScaling',
      scalingTargetId: cfnScalableTarget.attrId,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ECSServiceAverageCPUUtilization',
        },
        targetValue: 70,
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
      },
    });

    // Create Memory Scaling Policy using CfnScalingPolicy
    new cdk.aws_applicationautoscaling.CfnScalingPolicy(this, 'CfnMemoryScalingPolicy', {
      policyName: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-memory-scaling-${regionConfig.region}`,
      policyType: 'TargetTrackingScaling',
      scalingTargetId: cfnScalableTarget.attrId,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ECSServiceAverageMemoryUtilization',
        },
        targetValue: 80,
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
      },
    });

    // Create CodeDeploy Application using CfnApplication
    const cfnCodeDeployApplication = new codedeploy.CfnApplication(this, 'CfnCodeDeployApplication', {
      applicationName: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-codedeploy-${regionConfig.region}`,
      computePlatform: 'ECS',
    });

    // Create CodeDeploy Deployment Group using CfnDeploymentGroup
    new codedeploy.CfnDeploymentGroup(this, 'CfnDeploymentGroup', {
      applicationName: cfnCodeDeployApplication.applicationName!,
      deploymentGroupName: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-deployment-group-${regionConfig.region}`,
      serviceRoleArn: environmentConfig.iamRoleArn,
      deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
      blueGreenDeploymentConfiguration: {
        deploymentReadyOption: {
          actionOnTimeout: 'CONTINUE_DEPLOYMENT',
        },
        terminateBlueInstancesOnDeploymentSuccess: {
          action: 'TERMINATE',
          terminationWaitTimeInMinutes: 5,
        },
      },
      ecsServices: [
        {
          serviceName: cfnService.attrName,
          clusterName: cfnCluster.clusterName!,
        },
      ],
      loadBalancerInfo: {
        targetGroupInfoList: [
          {
            name: cfnGreenTargetGroup.attrTargetGroupName,
          },
        ],
      },
    });

    // Create Route53 Record using CfnRecordSet
    new route53.CfnRecordSet(this, 'CfnRecordSet', {
      hostedZoneId: regionConfig.hostedZoneId,
      name: `${environmentConfig.appName}-${environmentConfig.environment}-cfn-${regionConfig.region}`,
      type: 'A',
      aliasTarget: {
        dnsName: cfnLoadBalancer.attrDnsName,
        hostedZoneId: cfnLoadBalancer.attrCanonicalHostedZoneId,
        evaluateTargetHealth: true,
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'CfnLoadBalancerDNS', {
      value: cfnLoadBalancer.attrDnsName,
      description: 'Application Load Balancer DNS name (CFN Stack)',
    });

    new cdk.CfnOutput(this, 'CfnServiceArn', {
      value: cfnService.attrServiceArn,
      description: 'ECS Service ARN (CFN Stack)',
    });

    new cdk.CfnOutput(this, 'CfnClusterArn', {
      value: cfnCluster.attrArn,
      description: 'ECS Cluster ARN (CFN Stack)',
    });

    new cdk.CfnOutput(this, 'CfnCodeDeployApplicationName', {
      value: cfnCodeDeployApplication.applicationName!,
      description: 'CodeDeploy Application Name (CFN Stack)',
    });
  }
}