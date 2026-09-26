#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
set -a
. ./.env
set +a

dir=${BACKUP_DIR:-/var/backups/apartman}
keep=${BACKUP_KEEP_DAYS:-14}
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p "$dir"
chmod 700 "$dir"

docker compose exec -T postgres pg_dump -U apartman -d apartman --format=custom > "$dir/db-$stamp.dump.part"
mv "$dir/db-$stamp.dump.part" "$dir/db-$stamp.dump"
docker compose exec -T api tar czf - -C /data/uploads . > "$dir/uploads-$stamp.tar.gz.part"
mv "$dir/uploads-$stamp.tar.gz.part" "$dir/uploads-$stamp.tar.gz"

find "$dir" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime "+$keep" -delete
find "$dir" -maxdepth 1 -name '*.part' -delete

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  for file in "db-$stamp.dump" "uploads-$stamp.tar.gz"; do
    docker run --rm \
      -v "$dir:/backup:ro" \
      -e RCLONE_CONFIG_REMOTE_TYPE=s3 \
      -e RCLONE_CONFIG_REMOTE_PROVIDER=Other \
      -e RCLONE_CONFIG_REMOTE_ENDPOINT="$BACKUP_S3_ENDPOINT" \
      -e RCLONE_CONFIG_REMOTE_REGION="${BACKUP_S3_REGION:-auto}" \
      -e RCLONE_CONFIG_REMOTE_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" \
      -e RCLONE_CONFIG_REMOTE_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
      rclone/rclone:1 copyto "/backup/$file" "remote:$BACKUP_S3_BUCKET/$file" --s3-no-check-bucket
  done
  echo "$(date '+%F %T') yedek dış depoya kopyalandı: $BACKUP_S3_BUCKET"
fi

echo "$(date '+%F %T') yedek alındı: $dir/db-$stamp.dump, $dir/uploads-$stamp.tar.gz"
