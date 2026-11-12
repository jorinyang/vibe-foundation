# SPEC-OPS-01 处方

## 动作

1. 打开 `.vibe/config.json`，确认 `service.startCommand` 能在项目根启动服务、`service.baseUrl` 与 `startupTimeoutMs` 正确
2. 在服务里加 `/health`：只反映**进程是否活着**，返回 `200 {"status":"ok"}`，不查任何外部依赖
3. 加 `/ready`：反映**是否可接流量**，返回 `200 {"status":"ready","checks":[...]}`
4. `checks` 里逐项列出依赖与结果，例如 `[{"name":"db","ok":true},{"name":"redis","ok":false}]`
5. 任一关键依赖失败时，`/ready` 返回非 2xx（如 `503`），**不要返回 200**
6. 重跑验证命令

## 判定通过条件

```bash
node bin/vibe-check.mjs SPEC-OPS-01 --project .
```

退出码 `0`。

## 不可自动修复时

- 若项目是静态站点/无服务进程，该判定不适用，写 `.vibe/override/SPEC-OPS-01.md` 按 STANDARDS §7 记录负责人与到期日；状态是 `SKIP`，不算 `PASS`。
- 若端口被占用导致启动失败，先清理端口再重跑；不要把 `startupTimeoutMs` 调到掩盖真实启动失败。
