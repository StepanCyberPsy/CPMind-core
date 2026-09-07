# Сервисные аккаунты

resource "yandex_iam_service_account" "backend_signer" {
  folder_id   = var.folder_id
  name        = "cpmind-backend-signer"
  description = "Generates presigned upload URLs for staging bucket only"
}

resource "yandex_iam_service_account" "media_worker" {
  folder_id   = var.folder_id
  name        = "cpmind-media-worker"
  description = "Reads staging, writes source and delivery assets"
}

# Роли backend_signer — только PUT в staging

resource "yandex_resourcemanager_folder_iam_member" "signer_staging_uploader" {
  folder_id = var.folder_id
  role      = "storage.uploader"
  member    = "serviceAccount:${yandex_iam_service_account.backend_signer.id}"
}

# Роли media_worker — чтение staging, запись source и delivery

resource "yandex_resourcemanager_folder_iam_member" "worker_viewer" {
  folder_id = var.folder_id
  role      = "storage.viewer"
  member    = "serviceAccount:${yandex_iam_service_account.media_worker.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "worker_uploader" {
  folder_id = var.folder_id
  role      = "storage.uploader"
  member    = "serviceAccount:${yandex_iam_service_account.media_worker.id}"
}

# Статические ключи

resource "yandex_iam_service_account_static_access_key" "signer_key" {
  service_account_id = yandex_iam_service_account.backend_signer.id
  description        = "Static key for cpmind-backend-signer"
}

resource "yandex_iam_service_account_static_access_key" "worker_key" {
  service_account_id = yandex_iam_service_account.media_worker.id
  description        = "Static key for cpmind-media-worker"
}