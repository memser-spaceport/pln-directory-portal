terraform {
  required_version = ">= 1.2.8"

  backend "s3" {
    bucket = "pl-prod-auth-tf"
    key    = "ecscluster/dev/directory-service.tfstate"
    region = "us-west-1"
  }
}