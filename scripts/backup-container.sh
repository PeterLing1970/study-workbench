#!/bin/sh
set -eu

umask 077

backup_dir=/backups
interval=${BACKUP_INTERVAL_SECONDS:-86400}
retry_interval=${BACKUP_RETRY_SECONDS:-3600}
retention_days=${BACKUP_RETENTION_DAYS:-30}
run_once=${BACKUP_RUN_ONCE:-false}
lock_dir="$backup_dir/.backup.lock"

case "$interval" in
  ''|*[!0-9]*) echo "BACKUP_INTERVAL_SECONDS 必须是正整数。" >&2; exit 2 ;;
esac
case "$retention_days" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS 必须是非负整数。" >&2; exit 2 ;;
esac
case "$retry_interval" in
  ''|*[!0-9]*) echo "BACKUP_RETRY_SECONDS 必须是正整数。" >&2; exit 2 ;;
esac
if [ "$interval" -le 0 ] || [ "$retry_interval" -le 0 ]; then
  echo "备份周期和重试周期必须大于 0。" >&2
  exit 2
fi

mkdir -p "$backup_dir"
if [ "$run_once" != "true" ]; then
  # 容器异常中止可能留下空锁目录；常驻服务启动时清理它。
  rmdir "$lock_dir" 2>/dev/null || true
fi

run_backup() {
  timestamp=$(date +%Y%m%d-%H%M%S)
  dump_final="$backup_dir/study-$timestamp.dump"
  uploads_final="$backup_dir/uploads-$timestamp.tar.gz"
  checksums_final="$backup_dir/checksums-$timestamp.sha256"
  dump_tmp="$dump_final.tmp"
  uploads_tmp="$uploads_final.tmp"
  checksums_tmp="$checksums_final.tmp"

  if ! mkdir "$lock_dir" 2>/dev/null; then
    echo "已有备份任务正在运行，本次跳过。" >&2
    return 1
  fi

  cleanup() {
    rm -f "$dump_tmp" "$uploads_tmp" "$checksums_tmp"
    rmdir "$lock_dir" 2>/dev/null || true
  }
  trap 'cleanup; exit 1' INT TERM

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始备份数据库和错题图片。"
  if ! pg_dump --format=custom --file="$dump_tmp"; then
    echo "数据库导出失败。" >&2
    cleanup
    trap - INT TERM
    return 1
  fi
  if ! pg_restore --list "$dump_tmp" >/dev/null; then
    echo "数据库备份校验失败。" >&2
    cleanup
    trap - INT TERM
    return 1
  fi
  if ! tar -C /source -czf "$uploads_tmp" data/uploads; then
    echo "错题图片备份失败。" >&2
    cleanup
    trap - INT TERM
    return 1
  fi

  if [ ! -s "$dump_tmp" ] || [ ! -s "$uploads_tmp" ]; then
    echo "备份文件为空，拒绝发布本次备份。" >&2
    cleanup
    trap - INT TERM
    return 1
  fi

  if ! mv "$dump_tmp" "$dump_final" || ! mv "$uploads_tmp" "$uploads_final"; then
    echo "发布备份文件失败。" >&2
    rm -f "$dump_final" "$uploads_final"
    cleanup
    trap - INT TERM
    return 1
  fi
  if ! (
    cd "$backup_dir"
    sha256sum "$(basename "$dump_final")" "$(basename "$uploads_final")"
  ) > "$checksums_tmp" || ! mv "$checksums_tmp" "$checksums_final"; then
    echo "生成备份校验和失败。" >&2
    rm -f "$dump_final" "$uploads_final"
    cleanup
    trap - INT TERM
    return 1
  fi

  find "$backup_dir" -maxdepth 1 -type f \
    \( -name 'study-*.dump' -o -name 'uploads-*.tar.gz' -o -name 'checksums-*.sha256' \) \
    -mtime "+$retention_days" -delete

  trap - INT TERM
  rmdir "$lock_dir"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份完成：$dump_final"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 图片备份：$uploads_final"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 校验文件：$checksums_final"
}

while :; do
  if run_backup; then
    backup_status=0
    next_sleep=$interval
  else
    backup_status=$?
    next_sleep=$retry_interval
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 本轮备份失败，将在 $retry_interval 秒后重试。" >&2
  fi
  if [ "$run_once" = "true" ]; then
    exit "$backup_status"
  fi
  sleep "$next_sleep"
done
