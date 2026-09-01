#!/usr/bin/env bash
# 本机手动测试环境一键启动：PostgreSQL(5433) + 后端(8000) + 前端(5173)
# 用法：bash scripts/start-local.sh    （Ctrl+C 停止后端与前端；PG 保持运行）
# 说明：所有账号与密钥从项目根目录 .env 读取（.env 不入库），本脚本本身不含任何真实凭据，可安全提交。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python)"
else
  echo "[错误] 未找到 Python，请先安装 Python 3 并加入 PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[错误] 未找到 npm，请先安装 Node.js 并加入 PATH" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[错误] 未找到 $ENV_FILE，请先执行: cp .env.example .env  并填写真实值" >&2
  exit 1
fi

# 从 .env 读取单个键值（避免 source 解析 !&* 等特殊字符出错）
env_get() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-
}

PG_BIN="$ROOT/.local/pg16/pgsql/bin"
PGDATA="$ROOT/.local/pgdata"
POSTGRES_USER="$(env_get POSTGRES_USER)"; [ -z "$POSTGRES_USER" ] && POSTGRES_USER="study"
PGPASSWORD="$(env_get POSTGRES_PASSWORD)"
export PGPASSWORD

echo "[1/3] PostgreSQL 检查/启动 (127.0.0.1:5433)"
if ! netstat -ano 2>/dev/null | grep -q ":5433.*LISTENING"; then
  "$PG_BIN/pg_ctl.exe" -D "$PGDATA" -l "$ROOT/.local/pg.log" -o "-p 5433" start
else
  echo "     已运行，跳过"
fi
# 确保 study 库存在
"$PG_BIN/createdb.exe" -h 127.0.0.1 -p 5433 -U "$POSTGRES_USER" study 2>/dev/null || true

echo "[2/3] 后端 FastAPI (http://127.0.0.1:8000)"
cd "$ROOT/backend"
# 数据库密码含特殊字符时需 URL 编码
ENC_PASS="$("$PYTHON_BIN" -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$PGPASSWORD")"
export DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${ENC_PASS}@127.0.0.1:5433/study"
export UPLOAD_DIR="$ROOT/data/uploads"
export AUTH_COOKIE_SECURE=false
export PYTHONPATH="$ROOT/backend"
export AUTH_USERNAME="$(env_get AUTH_USERNAME)"
export AUTH_PASSWORD="$(env_get AUTH_PASSWORD)"
export AUTH_PARENT_USERNAME="$(env_get AUTH_PARENT_USERNAME)"
export AUTH_PARENT_PASSWORD="$(env_get AUTH_PARENT_PASSWORD)"
export AUTH_SECRET="$(env_get AUTH_SECRET)"
export AI_VISION_PROVIDER="$(env_get AI_VISION_PROVIDER)"
export DEEPSEEK_API_KEY="$(env_get DEEPSEEK_API_KEY)"
export DEEPSEEK_VISION_MODEL="$(env_get DEEPSEEK_VISION_MODEL)"
"$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACK_PID=$!

echo "[3/3] 前端 Vite (http://localhost:5173)"
cd "$ROOT/frontend"
npm run dev &
FRONT_PID=$!
trap 'echo "[停止] 关闭前端与后端"; kill "$BACK_PID" "$FRONT_PID" 2>/dev/null' INT TERM EXIT

echo ""
echo "=============================================="
echo "  手动测试地址:  http://localhost:5173"
echo "  登录凭据已从 .env 加载（为安全起见不在终端显示）"
echo "  API 文档:    http://127.0.0.1:8000/docs"
echo "  Ctrl+C 停止前端与后端（数据库保持运行）"
echo "=============================================="
wait $FRONT_PID $BACK_PID
