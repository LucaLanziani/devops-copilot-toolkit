# Terraform S3 State Backend Bootstrap

This Terraform configuration creates an S3 bucket for storing Terraform state files for other projects.

## Purpose

This is a **bootstrap configuration** that creates the S3 backend infrastructure. It uses **local state** since it's creating the remote state storage for other projects.

## What It Creates

- **S3 Bucket** for Terraform state storage
  - Versioning enabled (disaster recovery)
  - Server-side encryption (AES-256)
  - Public access blocked
  - Default name: `ai-tf-terraform-state`

## Prerequisites

- AWS credentials configured locally (AWS CLI or environment variables)
- Terraform >= 1.9.0 installed
- Appropriate IAM permissions to create S3 buckets

## Usage

### Step 1: Initialize Terraform

```bash
cd examples/AWS/bootstrap
terraform init
```

### Step 2: Review the Plan

```bash
terraform plan
```

### Step 3: Apply the Configuration

```bash
terraform apply
```

When prompted, type `yes` to confirm.

### Step 4: Note the Outputs

After successful deployment, Terraform will output:
- `bucket_name` - Use this in your backend configuration
- `bucket_arn` - ARN of the created bucket
- `bucket_region` - Region where bucket is located

## Customization

You can customize the configuration by creating a `terraform.tfvars` file:

```hcl
aws_region  = "us-east-1"           # Change region if needed
bucket_name = "my-custom-tf-state"  # Must be globally unique

tags = {
  Environment = "production"
  Team        = "platform"
}
```

Or pass variables via command line:

```bash
terraform apply -var="bucket_name=my-custom-state-bucket"
```

## Using the Created Bucket

After creating the S3 bucket, configure it as a backend in your other Terraform projects:

```hcl
# In your project's providers.tf or backend.tf
terraform {
  backend "s3" {
    bucket  = "ai-tf-terraform-state"  # Use the bucket_name output
    key     = "project-name/environment/terraform.tfstate"
    region  = "eu-west-1"
    encrypt = true
  }
}
```

## State File Organization

Recommended state file path structure within the bucket:

```
ai-tf-terraform-state/
├── example-1/
│   └── dev/
│       └── terraform.tfstate
├── example-2/
│   └── prod/
│       └── terraform.tfstate
└── networking/
    ├── dev/
    │   └── terraform.tfstate
    └── prod/
        └── terraform.tfstate
```

## Important Notes

- **Local State**: This bootstrap project uses local state (stored in `terraform.tfstate` file)
- **One-time Setup**: Typically run once per organization/project
- **Bucket Name**: Must be globally unique across all AWS accounts
- **No DynamoDB**: This configuration intentionally omits DynamoDB for state locking to keep it simple
- **State Backup**: Keep the local `terraform.tfstate` file from this bootstrap in a safe place

## Maintenance

### View Current State

```bash
terraform show
```

### Destroy Resources (Caution!)

Only destroy if you're sure no projects are using this bucket:

```bash
# First, ensure the bucket is empty
aws s3 rm s3://ai-tf-terraform-state --recursive

# Then destroy
terraform destroy
```

## Requirements

| Name | Version |
|------|---------|
| terraform | ~> 1.9 |
| aws | ~> 5.0 |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| aws_region | AWS region where the S3 bucket will be created | `string` | `"eu-west-1"` | no |
| bucket_name | Name of the S3 bucket for Terraform state storage. Must be globally unique. | `string` | `"ai-tf-terraform-state"` | no |
| tags | Tags to apply to the S3 bucket | `map(string)` | `{"Purpose": "Terraform State Storage", "ManagedBy": "Terraform"}` | no |

## Outputs

| Name | Description |
|------|-------------|
| bucket_name | Name of the S3 bucket for Terraform state storage |
| bucket_arn | ARN of the S3 bucket for Terraform state storage |
| bucket_region | AWS region where the S3 bucket is located |

## Security Best Practices

- ✅ Versioning enabled for state recovery
- ✅ Encryption at rest (AES-256)
- ✅ Public access blocked
- ✅ State stored in dedicated bucket
- ⚠️ No state locking (DynamoDB table not included for simplicity)
- ⚠️ Consider adding bucket lifecycle policies for old versions
- ⚠️ Consider enabling access logging for audit trail

## Troubleshooting

**Bucket name already exists:**
```bash
Error: creating Amazon S3 Bucket: BucketAlreadyExists
```
Solution: Change the `bucket_name` variable to a unique value.

**Insufficient permissions:**
```bash
Error: creating Amazon S3 Bucket: AccessDenied
```
Solution: Ensure your AWS credentials have `s3:CreateBucket` permission.

## License

Licensed under the same terms as the parent repository.
