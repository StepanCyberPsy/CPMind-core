# Origin group — delivery bucket как источник

resource "yandex_cdn_origin_group" "delivery" {
  name     = "cpmind-delivery-origin"
  use_next = false

  origin {
    source = "cpmind-delivery-assets.storage.yandexcloud.net"
  }
}

# CDN resource — раздача иммутабельных ассетов

resource "yandex_cdn_resource" "delivery" {
  cname           = "cdn.cpmind.tech"
  active          = true
  origin_group_id = yandex_cdn_origin_group.delivery.id

  options {
    custom_host_header     = "cpmind-delivery-assets.storage.yandexcloud.net"
    browser_cache_settings = 31536000

    static_response_headers = {
      "Cache-Control"          = "public, max-age=31536000, immutable"
      "X-Content-Type-Options" = "nosniff"
      "Referrer-Policy"        = "strict-origin-when-cross-origin"
    }

    cors = ["*"]
  }
}