# Идентификатор folder в Yandex Cloud
variable "folder_id" {
  type        = string
  description = "Yandex Cloud folder ID"
}

# IP-адрес production-сервера для A-record delivery.cpmind.tech
variable "server_ip" {
  type        = string
  description = "Production server IP for delivery.cpmind.tech DNS A-record"
}

# ID DNS-зоны cpmind.tech в Yandex Cloud DNS
variable "dns_zone_id" {
  type        = string
  description = "Yandex Cloud DNS zone ID for cpmind.tech"
}