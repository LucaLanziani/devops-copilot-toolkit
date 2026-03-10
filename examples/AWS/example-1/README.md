# Terraform AWS Example 1: EC2 and ElastiCache

This example demonstrates how to deploy a basic AWS infrastructure using Terraform with a modular approach. It creates an EC2 instance and an ElastiCache (Redis) cluster with associated security groups in an existing VPC.

## Architecture

This configuration deploys the following resources:

- **EC2 Instance**: A single EC2 instance in a private subnet with SSH access
- **ElastiCache Redis Cluster**: A Redis cluster with configurable node type and number of nodes
- **Security Groups**:
  - EC2 security group with SSH ingress (configurable CIDR)
  - ElastiCache security group for Redis access

## Prerequisites

Before using this example, ensure you have:

1. **AWS Account** with appropriate permissions to create EC2, ElastiCache, and security group resources
2. **Terraform** version >= 1.5.0 installed
3. **AWS CLI** configured with valid credentials
4. **S3 Backend**: Run the `bootstrap` example first to create the S3 bucket for remote state storage
5. **Existing VPC** with private subnets (this example requires pre-existing networking infrastructure)

## Module Structure

```
example-1/
├── main.tf              # Root module configuration
├── providers.tf         # Provider configuration
├── variables.tf         # Input variables
├── outputs.tf           # Output values
└── modules/
    ├── ec2/             # EC2 instance module
    ├── elasticache/     # ElastiCache module
    └── security_groups/ # Security groups module
```

## Backend Configuration

This example uses an S3 backend for remote state storage. The backend is configured to use:
- **Bucket**: `ai-tf-terraform-state`
- **Key**: `example-1/terraform.tfstate`
- **Region**: `eu-west-1`

**Important**: Before using this example, you must first deploy the bootstrap configuration to create the S3 bucket:

```bash
cd ../bootstrap
terraform init
terraform apply
cd ../example-1
```

## Usage

### 1. Configure Variables

Create a `terraform.tfvars` file or set variables via command line:

```hcl
aws_region         = "eu-west-1"
project_name       = "my-project"
vpc_id             = "vpc-0123456789abcdef0"
private_subnet_ids = ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1"]
allowed_ssh_cidr   = "10.0.0.0/8"  # Restrict to your IP range

# EC2 Configuration
ec2_ami_id         = "ami-0abcdef1234567890"  # Use a valid AMI for your region
ec2_instance_type  = "t3.micro"

# ElastiCache Configuration
elasticache_node_type = "cache.t3.micro"
elasticache_num_nodes = 1
```

### 2. Initialize Terraform

Initialize Terraform to configure the S3 backend:

```bash
terraform init
```

This will configure the remote backend and download the required providers.

### 3. Plan the Deployment

```bash
terraform plan
```

### 4. Apply the Configuration

```bash
terraform apply
```

### 5. Destroy Resources (when done)

```bash
terraform destroy
```

## Input Variables

| Variable | Description | Type | Default | Required |
|----------|-------------|------|---------|----------|
| `aws_region` | AWS region to deploy resources | `string` | `eu-west-1` | No |
| `project_name` | Project name used for resource tagging | `string` | `ai-tf` | No |
| `vpc_id` | VPC ID where resources will be created | `string` | `my-vpc-id` | Yes* |
| `private_subnet_ids` | List of private subnet IDs | `list(string)` | See variables.tf | Yes* |
| `allowed_ssh_cidr` | CIDR block allowed to SSH into EC2 | `string` | `0.0.0.0/0` | No |
| `ec2_ami_id` | AMI ID for EC2 instance | `string` | See variables.tf | Yes* |
| `ec2_instance_type` | EC2 instance type | `string` | `t3.micro` | No |
| `elasticache_node_type` | ElastiCache node type | `string` | `cache.t3.micro` | No |
| `elasticache_num_nodes` | Number of nodes in Redis cluster | `number` | `1` | No |

*While these have default values, they must be updated with valid values from your AWS environment.

## Outputs

| Output | Description |
|--------|-------------|
| `ec2_instance_id` | The ID of the created EC2 instance |
| `elasticache_cluster_id` | The ID of the ElastiCache Redis cluster |
| `security_group_ids` | Map of security group IDs for EC2 and ElastiCache |

## Important Notes

### Security Considerations

- **SSH Access**: The default `allowed_ssh_cidr` is set to `0.0.0.0/0` (open to the world). **Always restrict this to your specific IP range or bastion host in production**.
- **ElastiCache Access**: The ElastiCache security group currently has commented ingress rules. You may want to uncomment and configure the ingress rule in `modules/security_groups/main.tf` to allow access from the EC2 security group.
- **Private Subnets**: This example assumes EC2 and ElastiCache are deployed in private subnets as a security best practice.

### Cost Considerations

Running this example will incur AWS charges for:
- EC2 instance (varies by instance type and runtime)
- ElastiCache cluster (varies by node type, number of nodes, and runtime)

Estimated cost: ~$15-30/month for t3.micro/cache.t3.micro with minimal usage.

### Networking Requirements

This example requires:
- An **existing VPC** with proper CIDR configuration
- At least **two private subnets** in different availability zones (for ElastiCache subnet group)
- **Internet Gateway** or **NAT Gateway** if EC2 needs internet access

For creating the required networking infrastructure, see the `bootstrap` example in the parent directory.

## Customization

To extend this example:

1. **Add RDS Database**: Create a new module for RDS and add it to `main.tf`
2. **Configure ElastiCache Access**: Uncomment the ingress rule in `modules/security_groups/main.tf` to allow EC2 to connect to Redis
3. **Add Application Load Balancer**: Create a module for ALB and update security groups
4. **Enable Encryption**: Add encryption configuration to ElastiCache and EC2 volumes
5. **Add Auto Scaling**: Replace single EC2 instance with an Auto Scaling Group

## Troubleshooting

### Issue: Invalid VPC ID or Subnet IDs
**Solution**: Ensure you're using actual VPC and subnet IDs from your AWS account. Run `aws ec2 describe-vpcs` and `aws ec2 describe-subnets` to find valid values.

### Issue: AMI not found
**Solution**: AMI IDs are region-specific. Use `aws ec2 describe-images` to find a valid AMI for your region, or use an AMI lookup data source.

### Issue: ElastiCache subnet group requires multiple subnets
**Solution**: Provide at least two subnet IDs in different availability zones in the `private_subnet_ids` variable.

## References

- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS EC2 User Guide](https://docs.aws.amazon.com/ec2/)
- [AWS ElastiCache for Redis User Guide](https://docs.aws.amazon.com/elasticache/redis/)

## License

See the LICENSE file in the root of this repository.
