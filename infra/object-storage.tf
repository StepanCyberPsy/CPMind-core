# Staging — приватный, временные загрузки с автоудалением

resource "yandex_storage_bucket" "staging" {
  bucket     = "cpmind-upload-staging"
  access_key = yandex_iam_service_account_static_access_key.worker_key.access_key
  secret_key = yandex_iam_service_account_static_access_key.worker_key.secret_key
  acl        = "private"

  lifecycle_rule {
    id      = "expire-staging-objects"
    enabled = true
    expiration {
      days = 2
    }
  }

  lifecycle_rule {
    id      = "abort-incomplete-multipart"
    enabled = true
    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }

  cors_rule {
    allowed_headers = ["Content-Type", "Content-Length", "x-amz-*"]
    allowed_methods = ["PUT"]
    allowed_origins = ["https://app.cpmind.tech"]
    max_age_seconds = 3600
  }
}

# Source — приватный, оригиналы загруженных файлов

resource "yandex_storage_bucket" "source" {
  bucket     = "cpmind-source-assets"
  access_key = yandex_iam_service_account_static_access_key.worker_key.access_key
  secret_key = yandex_iam_service_account_static_access_key.worker_key.secret_key
  acl        = "private"
}

# Delivery — публичное чтение как CDN origin

resource "yandex_storage_bucket" "delivery" {
  bucket     = "cpmind-delivery-assets"
  access_key = yandex_iam_service_account_static_access_key.worker_key.access_key
  secret_key = yandex_iam_service_account_static_access_key.worker_key.secret_key

  anonymous_access_flags {
    read        = true
    list        = false
    config_read = false
  }

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag", "Content-Length", "Content-Range"]
    max_age_seconds = 86400
  }
}