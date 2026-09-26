#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

fail() {
  echo "Hata: $*" >&2
  exit 1
}

command -v docker > /dev/null || fail "Docker kurulu değil. Önce Docker Engine'i kurun: https://docs.docker.com/engine/install/"
docker compose version > /dev/null 2>&1 || fail "Docker Compose eklentisi bulunamadı."
command -v openssl > /dev/null || fail "openssl bulunamadı."
[ -f .env ] && fail "Bu sunucuda kurulum daha önce yapılmış (deploy/.env var). Güncelleme için update.sh kullanın."

ask() {
  local prompt=$1 default=${2:-} value
  while true; do
    read -rp "$prompt${default:+ [$default]}: " value
    value=${value:-$default}
    [ -n "$value" ] && { echo "$value"; return; }
  done
}

echo "Apartman Yönetim Sistemi kurulumu"
echo
DOMAIN=$(ask "Alan adı (ör. yonetim.ornekapartman.com)")
ACME_EMAIL=$(ask "Sertifika bildirimleri için e-posta")
APP_NAME=$(ask "Uygulama adı" "Apartman Yönetim Sistemi")
SITE_NAME=$(ask "İlk apartman veya sitenin adı")
SITE_KIND=$(ask "Türü (apartman/site)" "apartman")
case "$SITE_KIND" in
  apartman) SITE_KIND=APARTMENT ;;
  site) SITE_KIND=SITE ;;
  *) fail "Tür 'apartman' veya 'site' olmalıdır." ;;
esac
ADMIN_FIRST=$(ask "Sistem yöneticisinin adı")
ADMIN_LAST=$(ask "Sistem yöneticisinin soyadı")
ADMIN_EMAIL=$(ask "Sistem yöneticisinin e-postası")
while true; do
  read -rsp "Sistem yöneticisi şifresi (en az 8 karakter): " ADMIN_PASSWORD; echo
  read -rsp "Şifre (tekrar): " ADMIN_PASSWORD2; echo
  [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD2" ] && [ ${#ADMIN_PASSWORD} -ge 8 ] && break
  echo "Şifreler aynı değil veya 8 karakterden kısa, tekrar deneyin."
done

umask 077
cat > .env << EOF
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL

POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
JWT_ACCESS_SECRET=$(openssl rand -hex 48)

MESSAGING_PROVIDER=log
PAYMENT_PROVIDER=none

BACKUP_DIR=/var/backups/apartman
BACKUP_KEEP_DAYS=14
BACKUP_S3_ENDPOINT=
BACKUP_S3_REGION=auto
BACKUP_S3_BUCKET=
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=
EOF
echo "Gizli anahtarlar üretildi: deploy/.env (yalnızca root okuyabilir)"

echo "Uygulama derleniyor ve başlatılıyor, bu işlem birkaç dakika sürebilir..."
docker compose up -d --build

echo "API'nin hazır olması bekleniyor..."
for _ in $(seq 1 60); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 5
done
[ "${ready:-}" = 1 ] || fail "API başlamadı. 'docker compose logs api' ile inceleyin."

if ! docker compose exec -T \
  -e SETUP_ADMIN_FIRST_NAME="$ADMIN_FIRST" \
  -e SETUP_ADMIN_LAST_NAME="$ADMIN_LAST" \
  -e SETUP_ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e SETUP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e SETUP_SITE_NAME="$SITE_NAME" \
  -e SETUP_SITE_KIND="$SITE_KIND" \
  -e SETUP_APP_NAME="$APP_NAME" \
  api node dist/cli/setup.js; then
  fail "İlk kullanıcı oluşturulamadı. Henüz veri olmadığı için 'docker compose down -v && rm .env' ile temizleyip install.sh'i yeniden çalıştırabilirsiniz."
fi

chmod +x backup.sh restore.sh update.sh
cat > /etc/cron.d/apartman-yedek << EOF
30 3 * * * root $(pwd)/backup.sh >> /var/log/apartman-yedek.log 2>&1
EOF
echo "Her gece 03:30'da otomatik yedek alınacak (/etc/cron.d/apartman-yedek)."

echo
echo "Kurulum tamamlandı: https://$DOMAIN"
echo "Alan adı sunucuya yönlendirilmişse HTTPS sertifikası birkaç dakika içinde otomatik alınır."
