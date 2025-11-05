# 1. Configure the AWS Provider
provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------
# SECTION 2: SECRET & PERMISSION MANAGEMENT (IAM & SECRETS MANAGER)
# -----------------------------------------------------------------

# 2a. Create a secret to hold our .env file content
resource "aws_secretsmanager_secret" "env_secret" {
  name_prefix = "logsentry-env-secret-"
}

resource "aws_secretsmanager_secret_version" "env_secret_version" {
  secret_id     = aws_secretsmanager_secret.env_secret.id
  secret_string = var.env_file_content
}

# 2b. Create a secret to hold our Firebase credentials
resource "aws_secretsmanager_secret" "firebase_secret" {
  name_prefix = "logsentry-firebase-secret-"
}

resource "aws_secretsmanager_secret_version" "firebase_secret_version" {
  secret_id     = aws_secretsmanager_secret.firebase_secret.id
  secret_string = file(var.firebase_creds_path) # Read content from the file
}

# 2c. Create the IAM Role (the "permission slip") for our EC2 instance
resource "aws_iam_role" "logsentry_ec2_role" {
  name_prefix = "logsentry-ec2-role-"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
      },
    ]
  })
}

# 2d. Create the IAM Policy (what the "permission slip" allows)
resource "aws_iam_policy" "logsentry_secret_policy" {
  name_prefix = "logsentry-secret-read-policy-"
  description = "Allows the EC2 instance to read its own secrets"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = ["secretsmanager:GetSecretValue"]
        Effect   = "Allow"
        Resource = [
          aws_secretsmanager_secret.env_secret.arn,
          aws_secretsmanager_secret.firebase_secret.arn
        ]
      },
    ]
  })
}
# 2e. Attach the Policy to the Role
resource "aws_iam_role_policy_attachment" "attach_secret_policy" {
  role       = aws_iam_role.logsentry_ec2_role.name
  policy_arn = aws_iam_policy.logsentry_secret_policy.arn
}
# 2f. Create an Instance Profile (the "wrapper" for the Role)
resource "aws_iam_instance_profile" "logsentry_instance_profile" {
  name_prefix = "logsentry-instance-profile-"
  role = aws_iam_role.logsentry_ec2_role.name
}

# -----------------------------------------------------------------
# SECTION 3: INFRASTRUCTURE (VPC & EC2)
# -----------------------------------------------------------------

# 3a. Define our network security (Ports 80 for HTTP, 22 for SSH)
resource "aws_security_group" "logsentry_sg" {
  name_prefix = "logsentry-sg-"
  description = "Allow HTTP and SSH inbound traffic"
  ingress {
    from_port   = 22 # SSH
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80 # HTTP
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 3b. Find the latest Ubuntu AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

# 3c. Create the SSH Key Pair
resource "aws_key_pair" "deployer_key" {
  key_name_prefix = "logsentry-deployer-key-"
  public_key = file(var.ssh_public_key_path)
}

# 3d. Reserve a Static (Elastic) IP address
resource "aws_eip" "logsentry_eip" {
  tags = {
    Name = "LogSentry EIP"
  }
}

# 3e. Create the EC2 Instance (our server)
resource "aws_instance" "logsentry_server" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t2.micro" # Free Tier
  key_name      = aws_key_pair.deployer_key.key_name
  
  iam_instance_profile = aws_iam_instance_profile.logsentry_instance_profile.name
  vpc_security_group_ids = [aws_security_group.logsentry_sg.id]

  user_data = templatefile("user_data.sh", {
    DOCKER_IMAGE_NAME        = var.docker_image_name
    ENV_SECRET_ARN           = aws_secretsmanager_secret.env_secret.arn
    FIREBASE_SECRET_ARN      = aws_secretsmanager_secret.firebase_secret.arn
    AWS_REGION               = var.aws_region
  })

  tags = {
    Name = "LogSentry-Server"
  }
}

# 3f. Associate the Elastic IP with our EC2 Instance
resource "aws_eip_association" "eip_assoc" {
  instance_id   = aws_instance.logsentry_server.id
  allocation_id = aws_eip.logsentry_eip.id
}

