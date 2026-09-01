#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ "$#" -ne 2 ]; then
  echo "用法：CONFIRM_RESTORE=YES sh scripts/restore.sh data/backups/study-时间.dump data/backups/uploads-时间.tar.gz"
  exit 2
fi

dump_file=$1
uploads_file=$2

if [ ! -f "$dump_file" ] || [ ! -f "$uploads_file" ]; then
  echo "数据库备份或图片备份不存在。"
  exit 2
fi

if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "恢复会覆盖当前数据库与错题图片。确认目标文件后，设置 CONFIRM_RESTORE=YES 再执行。"
  exit 3
fi

timestamp=$(date +%Y%m%d-%H%M%S)
db_name=${POSTGRES_DB:-study}
db_user=${POSTGRES_USER:-study}

mkdir -p data/backups
if [ -d data/uploads ]; then
  tar -czf "data/backups/uploads-before-restore-$timestamp.tar.gz" data/uploads
fi
docker compose exec -T db pg_dump -U "$db_user" -d "$db_name" -Fc > "data/backups/study-before-restore-$timestamp.dump"

docker compose exec -T db pg_restore --clean --if-exists --no-owner -U "$db_user" -d "$db_name" < "$dump_file"
tar -xzf "$uploads_file" -C .

echo "恢复完成。恢复前快照已保存到 data/backups，接下来请检查 /api/health 并登录抽查数据。"
