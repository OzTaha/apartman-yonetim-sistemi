#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a

dir=${BACKUP_DIR:-/var/backups/apartman}
stamp=${1:-}
if [ -z "$stamp" ]; then
  echo "Kullanım: ./restore.sh <yedek-zamanı>   (ör. ./restore.sh 20260926-033000)"
  echo "Mevcut yedekler:"
  ls -1 "$dir" 2>/dev/null | sed -n 's/^db-\(.*\)\.dump$/  \1/p'
  exit 1
fi

db="$dir/db-$stamp.dump"
files="$dir/uploads-$stamp.tar.gz"
[ -f "$db" ] || { echo "Bulunamadı: $db" >&2; exit 1; }
[ -f "$files" ] || { echo "Bulunamadı: $files" >&2; exit 1; }

echo "Tüm veriler $stamp tarihli yedekteki haline döndürülecek. Bu yedekten sonraki kayıtlar silinir."
read -rp "Devam etmek için EVET yazın: " answer
[ "$answer" = "EVET" ] || { echo "İptal edildi."; exit 1; }

./backup.sh
docker compose stop web api
docker compose exec -T postgres pg_restore -U apartman -d apartman --clean --if-exists --no-owner < "$db"
docker compose run --rm --no-deps -T --entrypoint sh api \
  -c 'find /data/uploads -mindepth 1 -delete && tar xzf - -C /data/uploads' < "$files"
docker compose up -d

echo "Geri yükleme tamamlandı. Geri yüklemeden hemen önceki durum da yedeklendi."
