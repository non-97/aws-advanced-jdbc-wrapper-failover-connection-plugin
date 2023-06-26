import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface AuroraProps {
  vpc: cdk.aws_ec2.IVpc;
  dbClusterSg: cdk.aws_ec2.ISecurityGroup;
  rdsProxySg: cdk.aws_ec2.ISecurityGroup;
}

export class Aurora extends Construct {
  constructor(scope: Construct, id: string, props: AuroraProps) {
    super(scope, id);

    // DB Cluster Parameter Group
    const dbClusterParameterGroup = new cdk.aws_rds.ParameterGroup(
      this,
      "DbClusterParameterGroup",
      {
        engine: cdk.aws_rds.DatabaseClusterEngine.auroraPostgres({
          version: cdk.aws_rds.AuroraPostgresEngineVersion.VER_15_2,
        }),
        description: "aurora-postgresql15",
        parameters: {
          log_statement: "none",
          "pgaudit.log": "all",
          "pgaudit.role": "rds_pgaudit",
          shared_preload_libraries: "pgaudit",
          ssl_ciphers: "TLS_RSA_WITH_AES_256_GCM_SHA384",
        },
      }
    );

    // DB Parameter Group
    const dbParameterGroup = new cdk.aws_rds.ParameterGroup(
      this,
      "DbParameterGroup",
      {
        engine: cdk.aws_rds.DatabaseClusterEngine.auroraPostgres({
          version: cdk.aws_rds.AuroraPostgresEngineVersion.VER_15_2,
        }),
        description: "aurora-postgresql15",
      }
    );

    // Subnet Group
    const subnetGroup = new cdk.aws_rds.SubnetGroup(this, "SubnetGroup", {
      description: "description",
      vpc: props.vpc,
      subnetGroupName: "SubnetGroup",
      vpcSubnets: props.vpc.selectSubnets({
        onePerAz: true,
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED,
      }),
    });

    // Monitoring Role
    const monitoringRole = new cdk.aws_iam.Role(this, "MonitoringRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal(
        "monitoring.rds.amazonaws.com"
      ),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonRDSEnhancedMonitoringRole"
        ),
      ],
    });

    // DB Cluster
    const dbCluster = new cdk.aws_rds.DatabaseCluster(this, "Default", {
      engine: cdk.aws_rds.DatabaseClusterEngine.auroraPostgres({
        version: cdk.aws_rds.AuroraPostgresEngineVersion.VER_15_2,
      }),
      writer: cdk.aws_rds.ClusterInstance.provisioned("InstanceA", {
        instanceType: cdk.aws_ec2.InstanceType.of(
          cdk.aws_ec2.InstanceClass.T4G,
          cdk.aws_ec2.InstanceSize.MEDIUM
        ),
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: true,
        enablePerformanceInsights: true,
        parameterGroup: dbParameterGroup,
        performanceInsightRetention:
          cdk.aws_rds.PerformanceInsightRetention.DEFAULT,
        publiclyAccessible: false,
        instanceIdentifier: "db-instance-a",
      }),
      readers: [
        cdk.aws_rds.ClusterInstance.provisioned("InstanceB", {
          instanceType: cdk.aws_ec2.InstanceType.of(
            cdk.aws_ec2.InstanceClass.T4G,
            cdk.aws_ec2.InstanceSize.MEDIUM
          ),
          allowMajorVersionUpgrade: false,
          autoMinorVersionUpgrade: true,
          enablePerformanceInsights: true,
          parameterGroup: dbParameterGroup,
          performanceInsightRetention:
            cdk.aws_rds.PerformanceInsightRetention.DEFAULT,
          publiclyAccessible: false,
          instanceIdentifier: "db-instance-b",
        }),
        cdk.aws_rds.ClusterInstance.provisioned("InstanceC", {
          instanceType: cdk.aws_ec2.InstanceType.of(
            cdk.aws_ec2.InstanceClass.T4G,
            cdk.aws_ec2.InstanceSize.MEDIUM
          ),
          allowMajorVersionUpgrade: false,
          autoMinorVersionUpgrade: true,
          enablePerformanceInsights: true,
          parameterGroup: dbParameterGroup,
          performanceInsightRetention:
            cdk.aws_rds.PerformanceInsightRetention.DEFAULT,
          publiclyAccessible: false,
          instanceIdentifier: "db-instance-c",
        }),
        cdk.aws_rds.ClusterInstance.provisioned("InstanceD", {
          instanceType: cdk.aws_ec2.InstanceType.of(
            cdk.aws_ec2.InstanceClass.T4G,
            cdk.aws_ec2.InstanceSize.MEDIUM
          ),
          allowMajorVersionUpgrade: false,
          autoMinorVersionUpgrade: true,
          enablePerformanceInsights: true,
          parameterGroup: dbParameterGroup,
          performanceInsightRetention:
            cdk.aws_rds.PerformanceInsightRetention.DEFAULT,
          publiclyAccessible: false,
          instanceIdentifier: "db-instance-d",
        }),
      ],
      backup: {
        retention: cdk.Duration.days(7),
        preferredWindow: "16:00-16:30",
      },
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_YEAR,
      clusterIdentifier: "db-cluster",
      copyTagsToSnapshot: true,
      defaultDatabaseName: "testDB",
      deletionProtection: false,
      iamAuthentication: false,
      monitoringInterval: cdk.Duration.minutes(1),
      monitoringRole,
      parameterGroup: dbClusterParameterGroup,
      preferredMaintenanceWindow: "Sat:17:00-Sat:17:30",
      storageEncrypted: true,
      vpc: props.vpc,
      securityGroups: [props.dbClusterSg],
      subnetGroup,
    });

    // Manage master user password
    const cfnDbCluster = dbCluster.node
      .defaultChild as cdk.aws_rds.CfnDBCluster;
    cfnDbCluster.manageMasterUserPassword = true;
    cfnDbCluster.masterUsername = "postgresAdmin";
    cfnDbCluster.addPropertyDeletionOverride("MasterUserPassword");
    dbCluster.node.tryRemoveChild("Secret");

    const masterUserSecretArn = cfnDbCluster
      .getAtt("MasterUserSecret.SecretArn")
      .toString();

    // CA
    dbCluster.node.children.forEach((children) => {
      if (children.node.defaultChild instanceof cdk.aws_rds.CfnDBInstance) {
        (
          children.node.defaultChild as cdk.aws_rds.CfnDBInstance
        ).addPropertyOverride("CACertificateIdentifier", "rds-ca-rsa4096-g1");
      }
    });

    // RDS Proxy Role
    const proxyRole = new cdk.aws_iam.Role(this, "ProxyRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("rds.amazonaws.com"),
      managedPolicies: [
        new cdk.aws_iam.ManagedPolicy(this, "Get Secret Value Policy", {
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              resources: [masterUserSecretArn],
              actions: [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
            }),
          ],
        }),
      ],
    });

    // RDS Proxy
    const rdsProxy = new cdk.aws_rds.DatabaseProxy(this, "RdsProxy", {
      proxyTarget: cdk.aws_rds.ProxyTarget.fromCluster(dbCluster),
      secrets: [dbCluster.secret!],
      vpc: props.vpc,
      dbProxyName: "db-proxy",
      debugLogging: true,
      requireTLS: false,
      securityGroups: [props.rdsProxySg],
      vpcSubnets: props.vpc.selectSubnets({
        onePerAz: true,
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED,
      }),
      role: proxyRole,
    });
    proxyRole.node.tryRemoveChild("DefaultPolicy");

    const cfnRdsProxy = rdsProxy.node.defaultChild as cdk.aws_rds.CfnDBProxy;
    cfnRdsProxy.auth = [
      {
        authScheme: "SECRETS",
        iamAuth: "DISABLED",
        secretArn: masterUserSecretArn,
      },
    ];
  }
}
