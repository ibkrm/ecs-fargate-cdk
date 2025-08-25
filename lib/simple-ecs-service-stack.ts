import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig, RegionConfig } from './config/environment-config';

export interface SimpleEcsServiceStackProps extends cdk.StackProps {
  environmentConfig: EnvironmentConfig;
  regionConfig: RegionConfig;
}

export class SimpleEcsServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SimpleEcsServiceStackProps) {
    super(scope, id, props);

    const { environmentConfig, regionConfig } = props;

    // Import existing VPC
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: regionConfig.vpcId,
    });

    // Import existing subnets
    const subnets = regionConfig.subnetIds.map((subnetId, index) =>
      ec2.Subnet.fromSubnetId(this, `Subnet${index}`, subnetId)
    );

    // Import existing security groups
    const securityGroups = regionConfig.securityGroupIds.map((sgId, index) =>
      ec2.SecurityGroup.fromSecurityGroupId(this, `SecurityGroup${index}`, sgId)
    );

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc: vpc,
      clusterName: `${environmentConfig.appName}-${environmentConfig.environment}-simple-cluster-${regionConfig.region}`,
    });

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'EcsLogGroup', {
      logGroupName: `/ecs/${environmentConfig.appName}-${environmentConfig.environment}-simple-service-${regionConfig.region}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${environmentConfig.appName}-${environmentConfig.environment}-simple-task-${regionConfig.region}`,
      cpu: environmentConfig.cpu,
      memoryLimitMiB: environmentConfig.memory,
      taskRole: iam.Role.fromRoleArn(this, 'TaskRole', environmentConfig.iamRoleArn),
      executionRole: iam.Role.fromRoleArn(this, 'ExecutionRole', environmentConfig.iamRoleArn),
    });

    // Add container to task definition with multiple ports
    const _container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromRegistry(environmentConfig.containerImage),
      portMappings: [
        {
          containerPort: 8000,
          protocol: ecs.Protocol.TCP,
        },
        {
          containerPort: 8001,
          protocol: ecs.Protocol.TCP,
        },
        {
          containerPort: 8002,
          protocol: ecs.Protocol.TCP,
        },
      ],
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'ecs',
        logGroup: logGroup,
      }),
      environment: {
        // System environment variables
        ENVIRONMENT: environmentConfig.environment,
        REGION: regionConfig.region,
        // Custom environment variables from configuration
        ...environmentConfig.containerEnvironmentVariables,
      },
    });

    // Create Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
      vpc: vpc,
      internetFacing: true,
      vpcSubnets: {
        subnets: subnets,
      },
      securityGroup: securityGroups[0], // Use first security group for ALB
      loadBalancerName: `${environmentConfig.appName}-${environmentConfig.environment}-simple-alb-${regionConfig.region}`,
    });

    // Import existing certificate
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(
      this,
      'Certificate',
      regionConfig.certificateArn
    );

    // Create Target Groups for different ports
    const targetGroup8000 = new elbv2.ApplicationTargetGroup(this, 'TargetGroup8000', {
      vpc: vpc,
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: `${environmentConfig.appName}-${environmentConfig.environment}-tg-8000-${regionConfig.region}`,
      healthCheck: {
        enabled: true,
        path: environmentConfig.healthCheckPath,
        port: '8000',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    const targetGroup8001 = new elbv2.ApplicationTargetGroup(this, 'TargetGroup8001', {
      vpc: vpc,
      port: 8001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: `${environmentConfig.appName}-${environmentConfig.environment}-tg-8001-${regionConfig.region}`,
      healthCheck: {
        enabled: true,
        path: '/health',
        port: '8001',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    const targetGroup8002 = new elbv2.ApplicationTargetGroup(this, 'TargetGroup8002', {
      vpc: vpc,
      port: 8002,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: `${environmentConfig.appName}-${environmentConfig.environment}-tg-8002-${regionConfig.region}`,
      healthCheck: {
        enabled: true,
        path: '/health',
        port: '8002',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Create HTTPS Listener with path-based routing
    const httpsListener = alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.forward([targetGroup8000]), // Default to port 8000
    });

    // Host-based routing using subdomains
    // *.cloud.example.com -> port 8000 (default)
    // *.admin.cloud.example.com -> port 8001
    // *.ui.cloud.example.com -> port 8002

    httpsListener.addAction('AdminHostAction', {
      priority: 100,
      conditions: [elbv2.ListenerCondition.hostHeaders(['*.admin.cloud.example.com'])],
      action: elbv2.ListenerAction.forward([targetGroup8001]),
    });

    httpsListener.addAction('UiHostAction', {
      priority: 200,
      conditions: [elbv2.ListenerCondition.hostHeaders(['*.ui.cloud.example.com'])],
      action: elbv2.ListenerAction.forward([targetGroup8002]),
    });

    // Create HTTP Listener (redirect to HTTPS)
    alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    // Create ECS Service with fixed task count (no auto-scaling)
    const service = new ecs.FargateService(this, 'EcsService', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      serviceName: `${environmentConfig.appName}-${environmentConfig.environment}-simple-service-${regionConfig.region}`,
      desiredCount: 1, // Fixed to 1 task
      vpcSubnets: {
        subnets: subnets,
      },
      securityGroups: securityGroups,
      enableExecuteCommand: true,
      assignPublicIp: false,
      // Using default ECS deployment controller (not CODE_DEPLOY)
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
    });

    // Attach service to all target groups
    service.attachToApplicationTargetGroup(targetGroup8000);
    service.attachToApplicationTargetGroup(targetGroup8001);
    service.attachToApplicationTargetGroup(targetGroup8002);

    // Auto-scaling removed - running with fixed task count of 1

    // Create Route53 Record
    const hostedZone = route53.HostedZone.fromHostedZoneId(
      this,
      'HostedZone',
      regionConfig.hostedZoneId
    );

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: `${environmentConfig.appName}-${environmentConfig.environment}-simple-${regionConfig.region}`,
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(alb)),
      ttl: cdk.Duration.seconds(300),
    });

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS name',
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: service.serviceArn,
      description: 'ECS Service ARN',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: cluster.clusterArn,
      description: 'ECS Cluster ARN',
    });

    new cdk.CfnOutput(this, 'TargetGroup8000Arn', {
      value: targetGroup8000.targetGroupArn,
      description: 'Target Group ARN for port 8000 (*.cloud.example.com)',
    });

    new cdk.CfnOutput(this, 'TargetGroup8001Arn', {
      value: targetGroup8001.targetGroupArn,
      description: 'Target Group ARN for port 8001 (*.admin.cloud.example.com)',
    });

    new cdk.CfnOutput(this, 'TargetGroup8002Arn', {
      value: targetGroup8002.targetGroupArn,
      description: 'Target Group ARN for port 8002 (*.ui.cloud.example.com)',
    });
  }
}
