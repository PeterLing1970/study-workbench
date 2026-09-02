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
backup_dir=$(dirname "$dump_file")
dump_name=$(basename "$dump_file")
dump_stamp=${dump_name#study-}
dump_stamp=${dump_stamp%.dump}
checksums_file="$backup_dir/checksums-$dump_stamp.sha256"
before_dump="$backup_dir/study-before-restore-$timestamp.dump"
before_uploads="$backup_dir/uploads-before-restore-$timestamp.tar.gz"
before_dump_tmp="$before_dump.tmp"
before_uploads_tmp="$before_uploads.tmp"

if [ -f "$checksums_file" ]; then
  (cd "$backup_dir" && sha256sum -c "$(basename "$checksums_file")")
else
  echo "警告：未找到对应校验文件，将仅检查归档结构。" >&2
fi

docker compose exec -T db pg_restore --list < "$dump_file" >/dev/null
tar -tzf "$uploads_file" >/dev/null

cleanup() {
  rm -f "$before_dump_tmp" "$before_uploads_tmp"
}
trap cleanup EXIT INT TERM

if [ -d data/uploads ]; then
  tar -czf "$before_uploads_tmp" data/uploads
  mv "$before_uploads_tmp" "$before_uploads"
fi
docker compose exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$before_dump_tmp"
docker compose exec -T db pg_restore --list < "$before_dump_tmp" >/dev/null
mv "$before_dump_tmp" "$before_dump"

docker compose exec -T db sh -lc 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump_file"
tar -xzf "$uploads_file" -C .

trap - EXIT INT TERM
echo "恢复完成。恢复前快照已保存到 $backup_dir，接下来请检查 /api/health 并登录抽查数据。"
