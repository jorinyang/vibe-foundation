# SPEC-MCP-01 处方

## 动作

1. 打开 `.vibe/mcp-tools.json`
2. 给每个工具补 `resource` 与 `action`（形如 `order` / `write`）
3. 给每个工具补 `auth_mode`：
   - 不需要用户上下文的基础功能 → `service`，并写 `service_scope`（**必须具体，不能 `*` 或 `xxx:*`**）
   - 需要落到具体用户 → `user`，并写 `subjects`（如 `["owner","admin"]`）
4. 若提示能力未声明：去 `.vibe/routes.json` 补一条带该 `resource` / `action` 的路由声明
5. 重跑验证命令

## 判定通过条件

```bash
vibe-check SPEC-MCP-01 --project .
```

退出码 `0`。

## 不可自动修复时

若某工具确实没有对应的 HTTP 路由（纯 MCP 侧能力），先把它加进 `routes.json` 作为一条虚拟能力声明，并在 `source` 字段标注；**不要为了过判定把 `auth_mode` 写成 `service` 图省事**。
