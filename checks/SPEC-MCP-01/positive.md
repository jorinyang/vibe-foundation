# SPEC-MCP-01 正向用例

## 前提

`.vibe/mcp-tools.json`：

```json
{
  "version": 1,
  "tools": [
    { "name": "get_public_menu", "auth_mode": "service", "resource": "menu", "action": "read", "service_scope": ["menu:read"] },
    { "name": "update_order", "auth_mode": "user", "resource": "order", "action": "write", "subjects": ["owner", "admin"] }
  ]
}
```

`.vibe/routes.json` 里存在 `menu:read` 和 `order:write` 两个能力声明。

## 动作

```bash
vibe-check SPEC-MCP-01 --project .
```

## 期望

退出码 `0`；两条子判定 `PASS`：工具声明合法、能力均已声明。

## 失败含义

- 声明不合法：`auth_mode` 缺失时无法判断谁能调这个工具，MCP 就成了无鉴权入口
- 能力未声明：MCP 暴露了一个路由清单里根本没有的能力，等于绕过默认拒绝新开一扇门
