import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface VpcProps {}

export class Vpc extends Construct {
  readonly vpc: cdk.aws_ec2.IVpc;
  readonly dbClientSg: cdk.aws_ec2.ISecurityGroup;
  readonly dbServerSg: cdk.aws_ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props?: VpcProps) {
    super(scope, id);

    this.vpc = new cdk.aws_ec2.Vpc(this, "Default", {
      ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.1.1.0/24"),
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
          cidrMask: 27,
          mapPublicIpOnLaunch: true,
        },
        {
          name: "Isolated",
          subnetType: cdk.aws_ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 27,
        },
      ],
      gatewayEndpoints: {
        S3: {
          service: cdk.aws_ec2.GatewayVpcEndpointAwsService.S3,
        },
      },
    });

    // Security Group
    this.dbClientSg = new cdk.aws_ec2.SecurityGroup(this, "Db Client Sg", {
      vpc: this.vpc,
    });
    this.dbServerSg = new cdk.aws_ec2.SecurityGroup(this, "Db Server Sg", {
      vpc: this.vpc,
    });
    this.dbServerSg.addIngressRule(
      cdk.aws_ec2.Peer.securityGroupId(this.dbClientSg.securityGroupId),
      cdk.aws_ec2.Port.tcp(5432)
    );
  }
}
