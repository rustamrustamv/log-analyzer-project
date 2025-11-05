variable "aws_region" {
  description = "The AWS region to deploy to (e.g., 'us-east-1', 'eu-west-1')."
  type        = string
  default     = "us-east-1"
}

variable "ssh_public_key_path" {
  description = "The file path to your public SSH key (e.g., ~/.ssh/id_rsa.pub)"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "docker_image_name" {
  description = "The full name of your Docker image on Docker Hub (e.g., 'your-username/logsentry:latest')"
  type        = string
}

variable "env_file_content" {
  description = "The full text content of your .env file. (Set in terraform.tfvars)"
  type        = string
  sensitive   = true
}

# -----------------------------------------------------------------
# # We now ask for the PATH to the file, not the content.
# -----------------------------------------------------------------
variable "firebase_creds_path" {
  description = "The file path to your firebase_creds.json file."
  type        = string
  # No default, will be set in terraform.tfvars
}