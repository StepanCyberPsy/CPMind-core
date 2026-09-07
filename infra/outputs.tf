# CDN

output "cdn_cname" {
  description = "CNAME для cdn.cpmind.tech — добавить у регистратора"
  value       = yandex_cdn_resource.delivery.cname
}

# Signer — backend presigned URLs

output "signer_key_id" {
  description = "YC_SIGNER_KEY_ID для backend"
  value       = yandex_iam_service_account_static_access_key.signer_key.access_key
  sensitive   = true
}

output "signer_secret" {
  description = "YC_SIGNER_SECRET для backend"
  value       = yandex_iam_service_account_static_access_key.signer_key.secret_key
  sensitive   = true
}

# Worker — media worker read/write

output "worker_key_id" {
  description = "YC_WORKER_KEY_ID для media-worker"
  value       = yandex_iam_service_account_static_access_key.worker_key.access_key
  sensitive   = true
}

output "worker_secret" {
  description = "YC_WORKER_SECRET для media-worker"
  value       = yandex_iam_service_account_static_access_key.worker_key.secret_key
  sensitive   = true
}