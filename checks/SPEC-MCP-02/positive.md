# SPEC-MCP-02 正向用例

## 前提

`.vibe/config.json` 有 `service`，以及 `mcpProbe`：

```json
{
  "mcpProbe": {
    "path": "/mcp",
    "toolName": "update_order",
    "serviceToken": "Bearer svc-token",
    "userToken": "Bearer token-a",
    "tokenHeader": "authorization",
    "denyStatus": [401, 403],
    "arguments": {}
  }
}
```

`update_order` 在 `mcp-tools.json` 里声明为 `auth_mode: user`。

## 动作

```bash
vibe-check SPEC-MCP-02 --project .
```

## 期望

退出码 `0`，四条子判定 `PASS`：服务启动、服务身份调 user 工具被拒、无身份被拒、用户身份能调通。

判定同时接受两种拒绝形式：**HTTP 状态码拒绝**，或 **JSON-RPC `error` 对象拒绝**（MCP over HTTP 通常返回 200 + error）。

## 失败含义

- 服务身份能调用户级工具：等于 agent 拿了一把 admin 钥匙，所有越权都无法追溯
- 无身份也能调：入口没有鉴权，更严重
- 用户身份也调不通：这个 probe 没验到真实链路，需要先修通再重跑
