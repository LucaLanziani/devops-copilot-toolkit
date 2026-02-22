/**
 * @fileoverview AWS CDK Stack — Payment Service Infrastructure
 *
 * This module defines all AWS resources required by the Payment Service.
 * It provisions a VPC, ECS Fargate cluster, Application Load Balancer,
 * RDS Aurora PostgreSQL cluster, ElastiCache Redis replication group,
 * Secrets Manager secrets, SNS topics, SQS queues, and all associated
 * IAM roles and security groups.
 *
 * @version 3.7.1
 * @author platform-engineering@company.com
 * @since 2024-02-01
 *
 * @remarks
 * All resources are tagged with `cost-center`, `environment`, `service` and
 * `team` tags to enable granular cost allocation in AWS Cost Explorer.
 * Do NOT remove these tags — finance requires them for monthly chargebacks.
 *
 * @example
 * // Synthesise CloudFormation template locally
 * cdk synth --context env=staging
 *
 * // Deploy to production
 * cdk deploy PaymentStack --context env=production --require-approval broadening
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The maximum number of concurrent Fargate tasks during peak load. */
const MAX_FARGATE_TASKS = 50;

/** The minimum number of Fargate tasks to keep warm at all times. */
const MIN_FARGATE_TASKS = 2;

/** Default task CPU allocation (256 = 0.25 vCPU). */
const TASK_CPU = 512;

/** Default task memory allocation in MiB. */
const TASK_MEMORY_MIB = 1024;

/** Database port used by Aurora PostgreSQL. */
const DB_PORT = 5432;

/** Redis port used by ElastiCache. */
const REDIS_PORT = 6379;

/** Listener port for HTTPS traffic. */
const HTTPS_PORT = 443;

/** Listener port for HTTP traffic (immediately redirected to HTTPS). */
const HTTP_PORT = 80;

// ---------------------------------------------------------------------------
// Stack properties
// ---------------------------------------------------------------------------

/**
 * Configuration properties for the PaymentStack.
 * All properties are resolved from CDK context (`cdk.json` or `--context` CLI).
 */
export interface PaymentStackProps extends cdk.StackProps {
    /** Deployment environment: staging | production */
    readonly environment: string;

    /** Docker image tag to deploy (e.g. "sha-abc1234"). */
    readonly imageTag: string;

    /** Maximum number of Fargate tasks for auto-scaling. */
    readonly maxCapacity?: number;

    /** Minimum number of Fargate tasks (floor for scale-in). */
    readonly minCapacity?: number;

    /** RDS instance class for the Aurora writer instance. */
    readonly dbInstanceClass?: string;

    /** Number of RDS Aurora reader replicas to create (0–5). */
    readonly dbReaderCount?: number;

    /** ElastiCache Redis node type. */
    readonly redisNodeType?: string;

    /** Number of Redis replica nodes per shard. */
    readonly redisReplicasPerShard?: number;
}

// ---------------------------------------------------------------------------
// Main Stack
// ---------------------------------------------------------------------------

/**
 * PaymentStack provisions the complete infrastructure for the Payment Service.
 *
 * ### Resource hierarchy
 * ```
 * PaymentStack
 *  ├── VPC (3 AZs, public + private + isolated subnets)
 *  ├── ECS Cluster
 *  │   └── Fargate Task Definition
 *  │       ├── payment-api container
 *  │       └── datadog-agent sidecar
 *  ├── Application Load Balancer (internet-facing)
 *  │   ├── HTTP listener  → redirect 301 → HTTPS
 *  │   └── HTTPS listener → forward → ECS target group
 *  ├── Aurora PostgreSQL (writer + N readers)
 *  ├── ElastiCache Redis Replication Group
 *  ├── Secrets Manager (DB credentials, API keys)
 *  ├── SNS Topics (payment-events, payment-dlq-alerts)
 *  └── SQS Queues (payment-commands, payment-commands-dlq)
 * ```
 */
export class PaymentStack extends cdk.Stack {
    // Public outputs consumed by other stacks (e.g. monitoring stack)
    public readonly albDnsName: cdk.CfnOutput;
    public readonly ecsClusterName: cdk.CfnOutput;
    public readonly dbSecretArn: cdk.CfnOutput;
    public readonly paymentEventTopicArn: cdk.CfnOutput;

    constructor(scope: Construct, id: string, props: PaymentStackProps) {
        super(scope, id, props);

        // -----------------------------------------------------------------------
        // Resolve configurable defaults
        // -----------------------------------------------------------------------
        const maxCapacity = props.maxCapacity ?? MAX_FARGATE_TASKS;
        const minCapacity = props.minCapacity ?? MIN_FARGATE_TASKS;
        const dbInstanceClass =
            props.dbInstanceClass ?? "db.r6g.large";
        const dbReaderCount = props.dbReaderCount ?? 1;
        const redisNodeType = props.redisNodeType ?? "cache.r6g.large";
        const redisReplicasPerShard = props.redisReplicasPerShard ?? 1;

        // Common tags applied to every taggable construct in this stack.
        const commonTags = {
            "cost-center": "platform",
            environment: props.environment,
            service: "payment-api",
            team: "platform-engineering",
        };

        // -----------------------------------------------------------------------
        // VPC
        // -----------------------------------------------------------------------

        /**
         * Three-tier VPC:
         *  - Public subnets   : NAT gateways, ALB nodes
         *  - Private subnets  : Fargate tasks (outbound via NAT)
         *  - Isolated subnets : RDS, ElastiCache (no internet access)
         */
        const vpc = new ec2.Vpc(this, "PaymentVpc", {
            maxAzs: 3,
            natGateways: 3, // One per AZ for HA — costs ~$135/month, intentional
            subnetConfiguration: [
                {
                    name: "Public",
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24,
                },
                {
                    name: "Private",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                },
                {
                    name: "Isolated",
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                    cidrMask: 24,
                },
            ],
        });

        cdk.Tags.of(vpc).add("Name", `payment-vpc-${props.environment}`);

        // -----------------------------------------------------------------------
        // Security Groups
        // -----------------------------------------------------------------------

        // ALB security group — allows inbound 80 and 443 from any IPv4/IPv6.
        const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSg", {
            vpc,
            description: "Allow HTTP and HTTPS inbound to the Payment ALB",
            allowAllOutbound: true,
        });
        albSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(HTTP_PORT),
            "Allow HTTP from internet"
        );
        albSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(HTTPS_PORT),
            "Allow HTTPS from internet"
        );

        // ECS task security group — only accepts traffic from the ALB.
        const ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSg", {
            vpc,
            description:
                "Allow inbound traffic only from ALB to Payment ECS tasks",
            allowAllOutbound: true,
        });
        ecsSecurityGroup.addIngressRule(
            albSecurityGroup,
            ec2.Port.tcp(8080),
            "Allow ALB to reach Fargate tasks on port 8080"
        );

        // RDS security group — only accepts connections from ECS tasks.
        const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSg", {
            vpc,
            description: "Allow Postgres inbound only from ECS tasks",
            allowAllOutbound: false,
        });
        rdsSecurityGroup.addIngressRule(
            ecsSecurityGroup,
            ec2.Port.tcp(DB_PORT),
            "Allow Postgres from ECS tasks"
        );

        // Redis security group — only accepts connections from ECS tasks.
        const redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSg", {
            vpc,
            description: "Allow Redis inbound only from ECS tasks",
            allowAllOutbound: false,
        });
        redisSecurityGroup.addIngressRule(
            ecsSecurityGroup,
            ec2.Port.tcp(REDIS_PORT),
            "Allow Redis from ECS tasks"
        );

        // -----------------------------------------------------------------------
        // Secrets Manager
        // -----------------------------------------------------------------------

        /**
         * Database credentials secret.
         * Aurora will rotate this secret automatically every 30 days.
         * The ECS task role is granted `secretsmanager:GetSecretValue` on this ARN.
         */
        const dbSecret = new secretsmanager.Secret(this, "DbSecret", {
            secretName: `/payment/${props.environment}/db-credentials`,
            description: "Aurora PostgreSQL master credentials for Payment DB",
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: "payment_admin" }),
                generateStringKey: "password",
                excludePunctuation: true,
                passwordLength: 32,
            },
        });

        /**
         * Stripe API key secret.
         * Managed manually — CDK only creates the shell; humans populate the value.
         * Rotation is handled externally via the key-rotation Lambda in SecurityStack.
         */
        const stripeSecret = new secretsmanager.Secret(this, "StripeSecret", {
            secretName: `/payment/${props.environment}/stripe-api-key`,
            description: "Stripe secret API key (populated manually, rotated externally)",
        });

        // -----------------------------------------------------------------------
        // ECS Cluster
        // -----------------------------------------------------------------------

        const cluster = new ecs.Cluster(this, "PaymentCluster", {
            vpc,
            clusterName: `payment-cluster-${props.environment}`,
            containerInsights: true, // Enables CloudWatch Container Insights metrics
        });

        // -----------------------------------------------------------------------
        // IAM — Task Execution Role
        // -----------------------------------------------------------------------

        /**
         * Task execution role is assumed by the ECS agent (not the container).
         * It needs permission to pull images from ECR and fetch secrets from
         * Secrets Manager on behalf of the task definition.
         */
        const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AmazonECSTaskExecutionRolePolicy"
                ),
            ],
        });

        // Grant the execution role access to both secrets for injection at runtime.
        dbSecret.grantRead(taskExecutionRole);
        stripeSecret.grantRead(taskExecutionRole);

        // -----------------------------------------------------------------------
        // IAM — Task Role
        // -----------------------------------------------------------------------

        /**
         * Task role is assumed by the running container process.
         * Follows least-privilege: only the specific actions the service needs.
         */
        const taskRole = new iam.Role(this, "TaskRole", {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        });

        // Allow the task to publish to SNS and send/receive SQS messages.
        // Specific ARNs are added after the topic/queue constructs below.

        // -----------------------------------------------------------------------
        // CloudWatch Log Group
        // -----------------------------------------------------------------------

        const logGroup = new logs.LogGroup(this, "PaymentLogGroup", {
            logGroupName: `/ecs/payment-api/${props.environment}`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // -----------------------------------------------------------------------
        // Fargate Task Definition
        // -----------------------------------------------------------------------

        const taskDefinition = new ecs.FargateTaskDefinition(
            this,
            "PaymentTaskDef",
            {
                cpu: TASK_CPU,
                memoryLimitMiB: TASK_MEMORY_MIB,
                executionRole: taskExecutionRole,
                taskRole: taskRole,
                family: `payment-api-${props.environment}`,
            }
        );

        // Main application container — payment-api
        const appContainer = taskDefinition.addContainer("payment-api", {
            image: ecs.ContainerImage.fromRegistry(
                `123456789012.dkr.ecr.us-east-1.amazonaws.com/payment-api:${props.imageTag}`
            ),
            memoryLimitMiB: TASK_MEMORY_MIB,
            cpu: TASK_CPU,
            environment: {
                NODE_ENV: props.environment,
                PORT: "8080",
                LOG_LEVEL: props.environment === "production" ? "info" : "debug",
                AWS_REGION: this.region,
            },
            secrets: {
                // Injected at startup from Secrets Manager — not visible in ECS console
                DB_HOST: ecs.Secret.fromSecretsManager(dbSecret, "host"),
                DB_PORT: ecs.Secret.fromSecretsManager(dbSecret, "port"),
                DB_NAME: ecs.Secret.fromSecretsManager(dbSecret, "dbname"),
                DB_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
                DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
                STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(stripeSecret),
            },
            logging: ecs.LogDrivers.awsLogs({
                logGroup,
                streamPrefix: "payment-api",
            }),
            portMappings: [{ containerPort: 8080 }],
            healthCheck: {
                command: [
                    "CMD-SHELL",
                    "curl -f http://localhost:8080/health || exit 1",
                ],
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                retries: 3,
                startPeriod: cdk.Duration.seconds(60),
            },
        });

        // Datadog agent sidecar — collects metrics, traces and logs
        taskDefinition.addContainer("datadog-agent", {
            image: ecs.ContainerImage.fromRegistry(
                "public.ecr.aws/datadog/agent:7"
            ),
            memoryLimitMiB: 256,
            cpu: 64,
            environment: {
                DD_SITE: "datadoghq.com",
                DD_APM_ENABLED: "true",
                DD_LOGS_ENABLED: "true",
                DD_PROCESS_AGENT_ENABLED: "true",
                ECS_FARGATE: "true",
            },
            secrets: {
                DD_API_KEY: ecs.Secret.fromSsmParameter(
                    ssm.StringParameter.fromSecureStringParameterAttributes(
                        this,
                        "DdApiKey",
                        { parameterName: `/platform/datadog-api-key`, version: 1 }
                    )
                ),
            },
            logging: ecs.LogDrivers.awsLogs({
                logGroup,
                streamPrefix: "datadog-agent",
            }),
        });

        // -----------------------------------------------------------------------
        // Application Load Balancer
        // -----------------------------------------------------------------------

        const alb = new elbv2.ApplicationLoadBalancer(this, "PaymentAlb", {
            vpc,
            internetFacing: true,
            securityGroup: albSecurityGroup,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
            loadBalancerName: `payment-alb-${props.environment}`,
        });

        // HTTP listener — always redirect to HTTPS (301 permanent)
        const httpListener = alb.addListener("HttpListener", {
            port: HTTP_PORT,
            open: true,
            defaultAction: elbv2.ListenerAction.redirect({
                protocol: "HTTPS",
                port: String(HTTPS_PORT),
                permanent: true,
            }),
        });

        // HTTPS listener — forward healthy targets
        // NOTE: ACM certificate ARN is fetched from SSM to avoid hardcoding.
        const httpsListener = alb.addListener("HttpsListener", {
            port: HTTPS_PORT,
            certificates: [
                elbv2.ListenerCertificate.fromArn(
                    ssm.StringParameter.valueForStringParameter(
                        this,
                        `/platform/${props.environment}/acm-cert-arn`
                    )
                ),
            ],
            defaultAction: elbv2.ListenerAction.fixedResponse(503, {
                messageBody: "No healthy targets available",
            }),
        });

        // ECS Fargate Service
        const fargateService = new ecs.FargateService(this, "PaymentService", {
            cluster,
            taskDefinition,
            desiredCount: minCapacity,
            securityGroups: [ecsSecurityGroup],
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            serviceName: `payment-api-${props.environment}`,
            enableECSManagedTags: true,
            propagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
            circuitBreaker: {
                rollback: true, // Automatically rollback on consecutive failures
            },
        });

        // Register Fargate tasks with the HTTPS listener target group
        httpsListener.addTargets("EcsFargateTargets", {
            port: 8080,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [fargateService],
            healthCheck: {
                path: "/health",
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                healthyHttpCodes: "200",
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
            },
            deregistrationDelay: cdk.Duration.seconds(30),
        });

        // Auto-scaling policy: scale on CPU utilisation
        const scaling = fargateService.autoScaleTaskCount({
            minCapacity,
            maxCapacity,
        });
        scaling.scaleOnCpuUtilization("CpuScaling", {
            targetUtilizationPercent: 70,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(30),
        });
        // Also scale on request count per target (handles bursty payment spikes)
        scaling.scaleOnRequestCount("RequestScaling", {
            requestsPerTarget: 500,
            targetGroup: httpsListener.addTargets("DummyTarget", {
                port: 8080,
                targets: [],
            }),
            scaleInCooldown: cdk.Duration.seconds(120),
            scaleOutCooldown: cdk.Duration.seconds(30),
        });

        // -----------------------------------------------------------------------
        // Aurora PostgreSQL
        // -----------------------------------------------------------------------

        /**
         * Aurora Serverless v2 would be cheaper for variable workloads but we use
         * provisioned here for predictable latency — payment SLA requires p99 < 200ms.
         * Reader replicas offload analytics queries and serve as hot standbys.
         */
        const dbSubnetGroup = new rds.SubnetGroup(this, "DbSubnetGroup", {
            vpc,
            description: "Isolated subnets for Aurora PostgreSQL",
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            subnetGroupName: `payment-db-subnet-${props.environment}`,
        });

        const dbCluster = new rds.DatabaseCluster(this, "PaymentDb", {
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: rds.AuroraPostgresEngineVersion.VER_15_4,
            }),
            credentials: rds.Credentials.fromSecret(dbSecret),
            instanceProps: {
                instanceType: new ec2.InstanceType(dbInstanceClass),
                securityGroups: [rdsSecurityGroup],
                vpc,
                vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
                enablePerformanceInsights: true,
            },
            instances: 1 + dbReaderCount, // 1 writer + N readers
            defaultDatabaseName: "payment",
            subnetGroup: dbSubnetGroup,
            backup: {
                retention: cdk.Duration.days(7),
                preferredWindow: "03:00-04:00", // UTC — low traffic window
            },
            preferredMaintenanceWindow: "Mon:04:00-Mon:05:00",
            removalPolicy:
                props.environment === "production"
                    ? cdk.RemovalPolicy.RETAIN
                    : cdk.RemovalPolicy.DESTROY,
            deletionProtection: props.environment === "production",
            storageEncrypted: true, // PCI-DSS requirement
            cloudwatchLogsExports: ["postgresql"],
        });

        // -----------------------------------------------------------------------
        // ElastiCache Redis
        // -----------------------------------------------------------------------

        const redisSubnetGroup = new elasticache.CfnSubnetGroup(
            this,
            "RedisSubnetGroup",
            {
                description: "Isolated subnets for ElastiCache Redis",
                subnetIds: vpc.isolatedSubnets.map((s) => s.subnetId),
                cacheSubnetGroupName: `payment-redis-subnet-${props.environment}`,
            }
        );

        /**
         * Redis is used for:
         *  - Idempotency keys (TTL 24h) — prevents double-charges on retries
         *  - Session tokens (TTL 15min) — short-lived auth tokens
         *  - Rate-limiting counters (TTL sliding window)
         */
        const redisReplicationGroup = new elasticache.CfnReplicationGroup(
            this,
            "PaymentRedis",
            {
                replicationGroupDescription: `Payment Redis — ${props.environment}`,
                numNodeGroups: 1, // Single shard cluster (upgrade to multi-shard if >50GB)
                replicasPerNodeGroup: redisReplicasPerShard,
                cacheNodeType: redisNodeType,
                engine: "redis",
                engineVersion: "7.0",
                atRestEncryptionEnabled: true, // Required for PCI-DSS
                transitEncryptionEnabled: true,
                authToken: cdk.SecretValue.ssmSecure(
                    `/platform/${props.environment}/redis-auth-token`
                ).toString(),
                cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName!,
                securityGroupIds: [redisSecurityGroup.securityGroupId],
                automaticFailoverEnabled: true,
                multiAzEnabled: true,
                snapshotRetentionLimit: 3,
                snapshotWindow: "02:00-03:00",
                preferredMaintenanceWindow: "Sun:05:00-Sun:06:00",
                tags: Object.entries(commonTags).map(([k, v]) => ({
                    key: k,
                    value: v,
                })),
            }
        );

        // -----------------------------------------------------------------------
        // SNS Topics
        // -----------------------------------------------------------------------

        /** Payment domain events published for downstream consumers. */
        const paymentEventTopic = new sns.Topic(this, "PaymentEventTopic", {
            topicName: `payment-events-${props.environment}`,
            displayName: "Payment Domain Events",
        });

        /** Alert topic for dead-letter queue depth breaches. */
        const dlqAlertTopic = new sns.Topic(this, "DlqAlertTopic", {
            topicName: `payment-dlq-alerts-${props.environment}`,
            displayName: "Payment DLQ Alerts",
        });

        // -----------------------------------------------------------------------
        // SQS Queues
        // -----------------------------------------------------------------------

        /** Dead-letter queue — captures messages that failed after 3 attempts. */
        const commandDlq = new sqs.Queue(this, "PaymentCommandDlq", {
            queueName: `payment-commands-dlq-${props.environment}`,
            retentionPeriod: cdk.Duration.days(14),
            encryption: sqs.QueueEncryption.KMS_MANAGED,
        });

        /** Primary command queue — async payment processing (e.g. refunds, captures). */
        const commandQueue = new sqs.Queue(this, "PaymentCommandQueue", {
            queueName: `payment-commands-${props.environment}`,
            visibilityTimeout: cdk.Duration.seconds(300),
            retentionPeriod: cdk.Duration.days(4),
            encryption: sqs.QueueEncryption.KMS_MANAGED,
            deadLetterQueue: {
                queue: commandDlq,
                maxReceiveCount: 3, // Retry 3 times before sending to DLQ
            },
        });

        // Grant the ECS task role access to publish and consume from queues
        commandQueue.grantSendMessages(taskRole);
        commandQueue.grantConsumeMessages(taskRole);
        paymentEventTopic.grantPublish(taskRole);

        // -----------------------------------------------------------------------
        // CloudFormation Outputs
        // -----------------------------------------------------------------------

        this.albDnsName = new cdk.CfnOutput(this, "AlbDnsName", {
            value: alb.loadBalancerDnsName,
            description: "Payment ALB DNS name",
            exportName: `payment-alb-dns-${props.environment}`,
        });

        this.ecsClusterName = new cdk.CfnOutput(this, "EcsClusterName", {
            value: cluster.clusterName,
            description: "ECS Cluster name for Payment Service",
            exportName: `payment-cluster-name-${props.environment}`,
        });

        this.dbSecretArn = new cdk.CfnOutput(this, "DbSecretArn", {
            value: dbSecret.secretArn,
            description: "ARN of the Aurora PostgreSQL credentials secret",
            exportName: `payment-db-secret-arn-${props.environment}`,
        });

        this.paymentEventTopicArn = new cdk.CfnOutput(
            this,
            "PaymentEventTopicArn",
            {
                value: paymentEventTopic.topicArn,
                description: "ARN of the Payment Domain Events SNS topic",
                exportName: `payment-event-topic-arn-${props.environment}`,
            }
        );

        // Apply common tags to the entire stack
        Object.entries(commonTags).forEach(([key, value]) =>
            cdk.Tags.of(this).add(key, value)
        );
    }
}
