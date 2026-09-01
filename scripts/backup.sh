#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
mkdir -p data/backups

timestamp=$(date +%Y%m%d-%H%M%S)
db_name=${POSTGRES_DB:-study}
db_user=${POSTGRES_USER:-study}

docker compose exec -T db pg_dump -U "$db_user" -d "$db_name" -Fc > "data/backups/study-$timestamp.dump"
tar -czf "data/backups/uploads-$timestamp.tar.gz" data/uploads

echo "备份完成：data/backups/study-$timestamp.dump"
echo "图片备份：data/backups/uploads-$timestamp.tar.gz"

