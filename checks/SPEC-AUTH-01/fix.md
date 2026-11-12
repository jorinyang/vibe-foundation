# SPEC-AUTH-01 处方

## 动作

1. 打开 `.vibe/routes.json`
2. 对每条 `visibility: "public"` 的路由，补 `reason` 字段：写清**为什么可以公开**（不是这是什么），至少 8 个字
3. 对每条 `visibility: "protected"` 的路由，补 `resource`、`action`、`subjects` 三个字段
4. 若提示「实际路由未声明」：在 `.vibe/routes.json` 补登这些路由，能公开的写 `public` + reason，其余写 `protected` + 权限三元组
5. 若提示「声明路由实际不存在」：从 `.vibe/routes.json` 删除这些幽灵路由
6. 重跑验证命令

## 判定通过条件

```bash
node bin/vibe-check.mjs SPEC-AUTH-01 --project .
```

退出码 `0`，两条子判定均 `PASS`。

## 不可自动修复时

- 若实际路由表本身拿不到（`routeSource.endpoint` 未实现），先在项目侧生成 `.vibe/routes.actual.json`，或改用 `routeSource.type = "file"`。
- 若某条路由**必须**保持未声明（例如框架内置），写 `.vibe/override/SPEC-AUTH-01.md`，按 STANDARDS §7 记录负责人与到期日；豁免状态是 `SKIP`，不算 `PASS`。
