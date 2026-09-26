#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit edilmemiş değişiklikler var; paket yalnızca commit edilmiş koddan hazırlanır." >&2
  exit 1
fi

version=$(git describe --tags --always)
mkdir -p release
file="release/apartman-$version.tar.gz"
git archive --format=tar.gz --prefix=apartman/ -o "$file" HEAD
echo "Sürüm paketi hazır: $file"
