variable "ecr_url" {
   description = "The name of first docker conatiner image."
    
}

variable "container_target_group_arn" {
   description = "The name of backend container target group arn."
}

variable "container_host_port" {
    description = "The name of backend container host port."
    
}

variable "container_port" {
   description = "backend container port."
    
}

variable "container_cpu_limit" {
   description = "The name of backend container cpu limit."
    
}

variable "conatiner_memory_limit" {
   description = "The name of backend conatiner memory limit."
    
}

variable "imageversion" {
   description = "The version of the ECR image."
   }