# SPEC-OPS-01 正向用例

## 前提

`.vibe/config.json` 里有：

```json
{
  "service": {
    "startCommand": "npm start",
    "baseUrl": "http://127.0.0.1:3000",
    "startupTimeoutMs": 15000
  },
  "endpoints": { "health": "/health", "ready": "/ready" }
}
```

服务启动后：

- `GET /health` → `200` + JSON 对象
- `GET /ready` → `200` + JSON 对象，且含 `checks` 数组

## 动作

```bash
node bin/vibe-check.mjs SPEC-OPS-01 --project .
```

## 期望

- 退出码 `0`
- 三条子判定 `PASS`：服务启动、health 返回 JSON、ready 返回 JSON、ready 含 checks
- 判定结束后**服务进程已被清理**，端口不再占用

## 失败含义

- health 不是 JSON：监控系统无法解析，只能靠猜
- ready 缺 checks：无法反映依赖故障，永远报"就绪"，负载均衡会把坏实例接进来
