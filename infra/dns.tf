# DNS-зона cpmind.tech

data "yandex_dns_zone" "cpmind" {
  dns_zone_id = var.dns_zone_id
}

# cdn.cpmind.tech → Yandex CDN edge

resource "yandex_dns_recordset" "cdn" {
  zone_id = data.yandex_dns_zone.cpmind.id
  name    = "cdn"
  type    = "CNAME"
  ttl     = 300
  data    = ["${yandex_cdn_resource.delivery.cname}."]
}

# delivery.cpmind.tech → production server

resource "yandex_dns_recordset" "delivery" {
  zone_id = data.yandex_dns_zone.cpmind.id
  name    = "delivery"
  type    = "A"
  ttl     = 300
  data    = [var.server_ip]
}