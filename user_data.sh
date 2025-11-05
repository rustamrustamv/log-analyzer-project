#!/bin/bash
set -e # Exit immediately if a command fails

# 1. System Updates and Docker Installation
apt-get update -y
apt-get install -y docker.io awscli

# 2. Fetch Secrets from AWS Secrets Manager
# We use the AWS CLI, which works because of our IAM Role.
# We must use python3 to parse the JSON output.
ENV_CONTENT=$(aws secretsmanager get-secret-value --secret-id ${ENV_SECRET_ARN} --region ${AWS_REGION} | python3 -c "import sys, json; print(json.load(sys.stdin)['SecretString'])")
FIREBASE_CONTENT=$(aws secretsmanager get-secret-value --secret-id ${FIREBASE_SECRET_ARN} --region ${AWS_REGION} | python3 -c "import sys, json; print(json.load(sys.stdin)['SecretString'])")

# 3. Write Secrets to Files
# We write them to /home/ubuntu, which is the default user's home
echo "$ENV_CONTENT" > /home/ubuntu/.env
echo "$FIREBASE_CONTENT" > /home/ubuntu/firebase_creds.json

# 4. Pull the Docker Image
docker pull ${DOCKER_IMAGE_NAME}

# 5. Run the Docker Container
# This is almost the same as our local command
docker run -d --rm \
  -p 80:8000 \
  --env-file /home/ubuntu/.env \
  -v "/home/ubuntu/firebase_creds.json:/home/appuser/firebase_creds.json:ro" \
  --name logsentry-container \
  ${DOCKER_IMAGE_NAME}
