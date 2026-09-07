terraform {
  required_version = ">= 1.6.0"

  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.140"
    }
  }

  # Remote state в Yandex Object Storage (S3-совместимый протокол)
  # Credentials передаются через env vars при terraform init:
  #   AWS_ACCESS_KEY_ID     — static key ID сервисного аккаунта infra-deployer
  #   AWS_SECRET_ACCESS_KEY — secret key того же аккаунта
  # Bucket cpmind-terraform-state создаётся вручную один раз до terraform init
  backend "s3" {
    endpoint = "storage.yandexcloud.net"
    bucket   = "cpmind-terraform-state"
    key      = "production/terraform.tfstate"
    region   = "ru-central1"

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}