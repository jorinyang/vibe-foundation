# SPEC-MCP-02 处方

## 动作

1. 在 MCP 请求入口解析身份：服务 token 与服务身份绑定，用户 token 与用户主体绑定
2. 读 `mcp-tools.json` 里该工具的 `auth_mode`
3. **调用前**做身份判定：
   - `auth_mode: user` 且调用方是服务身份 → 返回 JSON-RPC error（`-32003 forbidden`）或 HTTP 403
   - 无有效 token → 返回 401 / `-32001 unauthorized`
4. 用户身份调用时，把主体写进请求上下文，业务层取 `currentUser` 而不是从参数里读 userId
5. 重跑验证命令

## 判定通过条件

```bash
vibe-check SPEC-MCP-02 --project .
```

退出码 `0`。

## 不可自动修复时

若项目还没有 MCP 端点，先在 `.vibe/config.json` 补 `mcpProbe` 并实现最小 `/mcp`；**不要为了过判定把 `denyStatus` 改成包含 200**——那等于把判定废掉。

豁免走 `.vibe/override/SPEC-MCP-02.md`，需负责人与到期日，状态是 `SKIP`，不算 `PASS`。
