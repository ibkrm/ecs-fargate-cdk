import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvironmentConfig, RegionConfig } from './config/environment-config';

export interface EcsServiceStackProps extends cdk.StackProps {
  environmentConfig: EnvironmentConfig;
  regionConfig: RegionConfig;
}

export class EcsServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsServiceStackProps) {
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
      clusterName: `${environmentConfig.appName}-${environmentConfig.environment}-cluster-${regionConfig.region}`,
    });

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'EcsLogGroup', {
      logGroupName: `/ecs/${environmentConfig.appName}-${environmentConfig.environment}-service-${regionConfig.region}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${environmentConfig.appName}-${environmentConfig.environment}-task-${regionConfig.region}`,
      cpu: environmentConfig.cpu,
      memoryLimitMiB: environmentConfig.memory,
      taskRole: iam.Role.fromRoleArn(this, 'TaskRole', environmentConfig.iamRoleArn),
      executionRole: iam.Role.fromRoleArn(this, 'ExecutionRole', environmentConfig.iamRoleArn),
    });

    // Add container to task definition
    const _container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromRegistry(environmentConfig.containerImage),
      portMappings: [
        {
          containerPort: environmentConfig.containerPort,
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
      loadBalancerName: `${environmentConfig.appName}-${environmentConfig.environment}-alb-${regionConfig.region}`,
    });

    // Import existing certificate
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(
      this,
      'Certificate',
      regionConfig.certificateArn
    );

    // Create HTTPS Listener
    const httpsListener = alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'OK',
      }),
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

    // Create Target Group (Green)
    const greenTargetGroup = new elbv2.ApplicationTargetGroup(this, 'GreenTargetGroup', {
      vpc: vpc,
      port: environmentConfig.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: `${environmentConfig.appName}-${environmentConfig.environment}-green-tg-${regionConfig.region}`,
      healthCheck: {
        enabled: true,
        path: environmentConfig.healthCheckPath,
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Add target group to listener
    httpsListener.addTargetGroups('GreenTargetGroup', {
      targetGroups: [greenTargetGroup],
    });

    // Create ECS Service

    const service = new ecs.FargateService(this, 'EcsService', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      serviceName: `${environmentConfig.appName}-${environmentConfig.environment}-service-${regionConfig.region}`,
      desiredCount: environmentConfig.desiredCount,
      vpcSubnets: {
        subnets: subnets,
      },
      securityGroups: securityGroups,
      enableExecuteCommand: true,
      assignPublicIp: false,
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY,
      },
    });

    // Attach service to target group
    service.attachToApplicationTargetGroup(greenTargetGroup);

    // Create Auto Scaling
    const scalableTarget = service.autoScaleTaskCount({
      minCapacity: environmentConfig.minCapacity,
      maxCapacity: environmentConfig.maxCapacity,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(300),
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(300),
    });

    // Create CodeDeploy Application
    const codeDeployApplication = new codedeploy.EcsApplication(this, 'CodeDeployApplication', {
      applicationName: `${environmentConfig.appName}-${environmentConfig.environment}-codedeploy-${regionConfig.region}`,
    });

    // Create Blue Target Group for blue/green deployment
    const blueTargetGroup = new elbv2.ApplicationTargetGroup(this, 'BlueTargetGroup', {
      vpc: vpc,
      port: environmentConfig.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: `${environmentConfig.appName}-${environmentConfig.environment}-blue-tg-${regionConfig.region}`,
      healthCheck: {
        enabled: true,
        path: environmentConfig.healthCheckPath,
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Create CodeDeploy Deployment Group
    const _deploymentGroup = new codedeploy.EcsDeploymentGroup(this, 'DeploymentGroup', {
      application: codeDeployApplication,
      deploymentGroupName: `${environmentConfig.appName}-${environmentConfig.environment}-deployment-group-${regionConfig.region}`,
      service: service,
      deploymentConfig: codedeploy.EcsDeploymentConfig.ALL_AT_ONCE,
      role: iam.Role.fromRoleArn(this, 'CodeDeployRole', environmentConfig.iamRoleArn),
      blueGreenDeploymentConfig: {
        listener: httpsListener,
        blueTargetGroup: blueTargetGroup,
        greenTargetGroup: greenTargetGroup,
        deploymentApprovalWaitTime: cdk.Duration.minutes(0),
        terminationWaitTime: cdk.Duration.minutes(5),
      },
    });

    // Create Route53 Record
    const hostedZone = route53.HostedZone.fromHostedZoneId(
      this,
      'HostedZone',
      regionConfig.hostedZoneId
    );

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: `${environmentConfig.appName}-${environmentConfig.environment}-${regionConfig.region}`,
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

    new cdk.CfnOutput(this, 'CodeDeployApplicationName', {
      value: codeDeployApplication.applicationName,
      description: 'CodeDeploy Application Name',
    });
  }
}
