#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# 使用与自动备份服务完全相同的流程，避免手动备份遗漏校验或写入错误目录。
docker compose run --rm -T -e BACKUP_RUN_ONCE=true backup

