#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

package=${1:-}
[ -n "$package" ] && [ -f "$package" ] || {
  echo "Kullanım: ./update.sh <sürüm-paketi.tar.gz>"
  exit 1
}
package=$(realpath "$package")
root=$(realpath ..)

echo "Güncellemeden önce yedek alınıyor..."
./backup.sh

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
tar xzf "$package" -C "$staging"
[ -f "$staging/apartman/deploy/docker-compose.yml" ] || {
  echo "Paket geçersiz: apartman/deploy/docker-compose.yml bulunamadı" >&2
  exit 1
}

find "$root" -mindepth 1 -maxdepth 1 ! -name deploy -exec rm -rf {} +
find "$root/deploy" -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +
cp -a "$staging/apartman/." "$root/"
chmod +x "$root"/deploy/*.sh

docker compose up -d --build
docker image prune -f > /dev/null
echo "Güncelleme tamamlandı. Veritabanı değişiklikleri API açılırken uygulandı."
