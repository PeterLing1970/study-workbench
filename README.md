# 初三 AI 学习工作台

当前版本：**v0.4.1**。面向手机、iPad 和电脑的家庭学习工作台，包含学生/家长双角色、任务与循环模板、专注记录、艾宾浩斯错题复习、八科成绩趋势、AI 辅导与真实数据周报。

## 运行架构

- `web`：React + Vite 构建后由 Nginx 提供页面，并统一代理 `/api`。
- `api`：FastAPI，负责任务、错题、成绩和模型调用。
- `db`：PostgreSQL，正式学习记录的唯一数据源。
- `hermes`：可选的 Hermes Agent 容器，使用 Compose profile 单独启用。
- MiniMax/DeepSeek：由后端通过 OpenAI 兼容的 Chat Completions API 调用，密钥不会进入浏览器。

公网只需要映射 `web` 的 `8787` 端口。数据库、API和Hermes均不映射到宿主机公网端口。

## 飞牛部署

建议项目路径：

```text
/vol1/1000/Docker/study-workbench
```

进入项目目录后执行：

```bash
cp .env.example .env
```

编辑 `.env`，至少修改：

```text
POSTGRES_PASSWORD=随机长密码
AUTH_USERNAME=学生登录账号
AUTH_PASSWORD=至少12位的学生密码
AUTH_PARENT_USERNAME=家长登录账号
AUTH_PARENT_PASSWORD=至少12位的家长密码
AUTH_SECRET=至少32位的随机会话密钥
AUTH_COOKIE_SECURE=true
TRUSTED_ORIGINS=https://study.rostai.top
SEED_DEMO_DATA=false
MINIMAX_API_KEY=你的MiniMax Subscription Key或API Key
DEEPSEEK_API_KEY=你的DeepSeek API Key（可暂时留空）
```

首次启动：

```bash
docker compose up -d --build
docker compose ps
```

局域网访问：

```text
http://192.168.1.74:8787
```

首次打开会进入登录页：学生使用 `AUTH_USERNAME` / `AUTH_PASSWORD`，家长使用 `AUTH_PARENT_USERNAME` / `AUTH_PARENT_PASSWORD`。密码只在后端校验，数据库只保存加盐后的 scrypt 哈希；登录状态使用带签名的 HttpOnly Cookie，默认保持 7 天。

### 学生与家长权限

- 学生账号：查看并完成任务、启动专注计时、上传错题、调用 AI 辅导、记录成绩。
- 家长账号：查看今日完成进度、科目状态、待复习错题和成绩；全部学习数据保持只读。
- 权限由后端接口强制执行。即使绕过前端，家长账号调用写接口也会返回 `403`。
- 从旧版本升级时，API 启动会执行幂等结构检查，为现有表补充角色、模板关联和错题复习字段，并保留原有数据。

仅使用局域网 HTTP 时保持 `AUTH_COOKIE_SECURE=false`。通过 `https://study.rostai.top` 使用时必须设置为 `true`，并把 `TRUSTED_ORIGINS` 设置为实际 HTTPS 域名后重启 API：

```bash
docker compose up -d --force-recreate api
```

若需修改登录密码，编辑对应的 `AUTH_PASSWORD` 或 `AUTH_PARENT_PASSWORD` 后重启 API，系统会在启动时更新密码哈希，旧登录会话仍会在有效期内保留；如需立即使全部旧会话失效，同时更换 `AUTH_SECRET`。

### 手机和 iPad

- 手机：适配 390×844 等常见竖屏尺寸，主导航固定在底部。
- iPad Pro 11 英寸（2018）：已按竖屏 834×1194、横屏 1194×834 验证，使用更适合平板的左侧导航。
- Safari 打开工作台后，可点“共享 → 添加到主屏幕”，以后像普通应用一样进入。

检查服务：

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/api/health
docker compose logs --tail=100 api web db
```

## Hermes（可选）

工作台不依赖 Hermes 才能启动。建议先验证登录、任务、成绩、错题和模型API，再启用 Hermes。

首次配置向导：

```bash
docker compose --profile hermes run --rm hermes setup
```

启动 Hermes gateway：

```bash
docker compose --profile hermes up -d hermes
```

Hermes 数据保存在 `data/hermes`，端口 `8642` 只在内部 Docker 网络中开放。

## AI路由

- 日常总结、作文阅读：优先 MiniMax M3。
- 数学、物理、化学文本难题：按主模型尝试，失败时自动切换备用模型。
- 使用 `sk-cp` Token Plan Key 时，错题图片理解需要 MiniMax 官方 MCP；当前普通聊天接口不接受该图片请求，因此会明确降级为演示分析。后续接入 MCP 后再启用真实图片理解。
- 未配置密钥：界面仍可操作，AI返回明确标注的演示结果。
- 任何AI分析都不会自动修改考试成绩。
- 打开周报只读取真实统计，不调用模型、不写数据库；只有点击“生成本周 AI 诊断”才会请求模型并保存结果。
- 真实记录为 0 时会保留 0 并提示数据不足，禁止使用演示数字冒充学习数据。
- `SEED_DEMO_DATA` 默认关闭；升级时会删除旧版本内置的“七月期末摸底”和“八月阶段测验”示例成绩。两道示例错题会标记为“演示数据”，不参与真实周报统计。

本项目按中国区账号配置 MiniMax：`https://api.minimaxi.com/v1/chat/completions`，模型名 `MiniMax-M3`；国际区账号应改用 `https://api.minimax.io/v1`。DeepSeek接口为 `https://api.deepseek.com/chat/completions`。

## FRP/1Panel

本项目不修改现有 FRPC/FRPS。局域网稳定后，将 NAS 的 `8787` 端口通过现有 FRPC 映射到云端，再由 1Panel Nginx 把 `study.rostai.top` 反向代理到该映射端口。

建议在 1Panel 开启 HTTPS，并保留这些请求头：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

前端容器已设置 CSP、HSTS、禁止 MIME 嗅探、防嵌套、Referrer Policy 和 Permissions Policy。1Panel 若覆盖响应头，应保留等价配置。

## 备份

执行：

```bash
sh scripts/backup.sh
```

输出位于 `data/backups`。建议再同步到另一块磁盘或其他设备。

恢复前先确认数据库和图片备份属于同一次备份，再执行：

```bash
CONFIRM_RESTORE=YES sh scripts/restore.sh \
  data/backups/study-YYYYMMDD-HHMMSS.dump \
  data/backups/uploads-YYYYMMDD-HHMMSS.tar.gz
```

恢复脚本会先为当前数据库和图片生成一份恢复前快照。建议每月至少做一次恢复演练，不能只确认“备份文件存在”。

## 更新

```bash
docker compose build --pull
docker compose up -d
curl -fsS https://study.rostai.top/api/health
```

更新前先执行备份。确认新版本稳定后再人工清理旧镜像；不要把 `.env`、API密钥或数据库备份提交到代码仓库。
