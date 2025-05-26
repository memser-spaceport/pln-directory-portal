
variable "aws_region" {
  description = "Region for the VPC"
  default = "us-west-1"
}

resource "aws_ecs_service" "ecsservice" {
  name            = "dev_directory_service"
  cluster         = "prod_pln_auth"
  task_definition = "${aws_ecs_task_definition.ecstaskdefinition.family}:${max("${aws_ecs_task_definition.ecstaskdefinition.revision}")}"
  desired_count   = 2
  # Rolling update configuration
  deployment_maximum_percent       = 200
  deployment_minimum_healthy_percent = 50
  enable_ecs_managed_tags           = true
  load_balancer {
    
    target_group_arn = var.container_target_group_arn
    container_name   = "directory_service_container"
    container_port   = var.container_port
  } 
  
}


resource "aws_ecs_task_definition" "ecstaskdefinition" {
  family                   = "directory_service_td"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn = aws_iam_role.ecs_execution_role.arn
  container_definitions = jsonencode (
[
  {
    "portMappings": [
      {
        "hostPort": "${var.container_host_port}",
        "protocol": "tcp",
        "containerPort": "${var.container_port}"
      }
    ],
    "cpu": "${var.container_cpu_limit}",
    "memory": "${var.conatiner_memory_limit}",
    "image": "${var.ecr_url}:${var.imageversion}",
    "essential": true,
    "name": "dev-directory_service_container",
    "environment": [
        {
          "name": "DATABASE_URL",
          "value": "${data.aws_ssm_parameter.db_url.value}"
        },
        {
          "name": "REDIRECT_PROTOCOL",
          "value": "https"
        },
        {
          "name": "APP_PORT",
          "value": "3000"
        },
        {
          "name": "LOG_ENV",
          "value": "prod"
        },
        {
          "name": "NODE_ENV",
          "value": "prod"
        }        
    ],
    "logConfiguration" : {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group"         : "/ecs/dev-directory-service",
        "awslogs-region"        : "us-west-1",
        "awslogs-stream-prefix" : "dev-directory-service"
      }
    }
  }
]
)
}

data "aws_ssm_parameter" "db_url" {
  name = "/dev/directory-service/dburl"
}

resource "aws_iam_role" "ecs_execution_role" {
  name = "ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

data "aws_iam_policy" "execution_policy" {
  name = "AmazonEC2ContainerRegistryFullAccess"
}

data "aws_iam_policy" "ecs_execution_policy" {
name = "AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_policy_attachment" "ecs_policy_attachment" {
  name       = "ecs-policy-attachment"
  roles      = [aws_iam_role.ecs_execution_role.name]
  policy_arn = data.aws_iam_policy.execution_policy.arn
}

resource "aws_iam_policy_attachment" "ecs_execution_policy_attachment" {
  name       = "ecs-execution-policy-attachment"
  roles      = [aws_iam_role.ecs_execution_role.name]
  policy_arn = data.aws_iam_policy.ecs_execution_policy.arn
}