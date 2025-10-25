#!/bin/bash

# WebUI Deployment System Manager - IAM Setup Script
# This script creates an IAM policy with least privilege for the deployment system

set -e

# Configuration
POLICY_NAME="WebUIDeploymentSystemPolicy"
POLICY_FILE="$(dirname "$0")/iam-policy.json"
AWS_PROFILE="gemini-pro_ck"

echo "========================================"
echo "WebUI Deployment System - IAM Setup"
echo "========================================"
echo ""

# Check if policy file exists
if [ ! -f "$POLICY_FILE" ]; then
    echo "Error: Policy file not found at $POLICY_FILE"
    exit 1
fi

echo "Using AWS Profile: $AWS_PROFILE"
echo "Policy Name: $POLICY_NAME"
echo ""

# Create the IAM policy
echo "Creating IAM policy..."
POLICY_ARN=$(aws iam create-policy \
    --profile "$AWS_PROFILE" \
    --policy-name "$POLICY_NAME" \
    --policy-document file://"$POLICY_FILE" \
    --description "Least privilege policy for WebUI Deployment System Manager" \
    --query 'Policy.Arn' \
    --output text 2>/dev/null || \
    aws iam list-policies \
        --profile "$AWS_PROFILE" \
        --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" \
        --output text)

if [ -z "$POLICY_ARN" ]; then
    echo "Error: Failed to create or find policy"
    exit 1
fi

echo "Policy ARN: $POLICY_ARN"
echo ""

# Optional: Create a role and attach the policy
read -p "Do you want to create an IAM role for this policy? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ROLE_NAME="WebUIDeploymentSystemRole"

    # Create trust policy for EC2 (modify as needed)
    cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    echo "Creating IAM role..."
    aws iam create-role \
        --profile "$AWS_PROFILE" \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file:///tmp/trust-policy.json \
        --description "Role for WebUI Deployment System Manager" || echo "Role may already exist"

    echo "Attaching policy to role..."
    aws iam attach-role-policy \
        --profile "$AWS_PROFILE" \
        --role-name "$ROLE_NAME" \
        --policy-arn "$POLICY_ARN"

    rm /tmp/trust-policy.json
    echo ""
    echo "Role created: $ROLE_NAME"
fi

echo ""
echo "========================================"
echo "IAM Setup Complete!"
echo "========================================"
echo ""
echo "Policy Permissions Summary:"
echo "  - List and read from: build-artifacts-bucket"
echo "  - Full deployment access to: deploy-webui-bucket"
echo "  - Following least privilege principle"
echo ""
echo "Next Steps:"
echo "  1. Attach this policy to your IAM user or role"
echo "  2. Configure AWS credentials with profile: $AWS_PROFILE"
echo "  3. Update .env file with bucket names"
echo ""
