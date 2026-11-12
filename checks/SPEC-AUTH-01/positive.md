# SPEC-AUTH-01 正向用例

## 前提

项目根存在：

- `.vibe/ref.json` → `{"spec": "0.2.0"}`
- `.vibe/config.json` → `{"routeSource": {"type": "file", "path": ".vibe/routes.actual.json"}}`
- `.vibe/routes.json` → 每条路由都有 `method` / `path` / `visibility`；`public` 带 `reason`（≥8 字）；`protected` 带 `resource` / `action` / `subjects`
- `.vibe/routes.actual.json` → 实际路由表，与声明完全一致

## 动作

```bash
node bin/vibe-check.mjs SPEC-AUTH-01 --project .
```

## 期望

- 退出码 `0`
- 子判定「routes.json 声明合法」`PASS`，显示声明条数
- 子判定「声明覆盖实际路由」`PASS`，显示实际路由条数

## 失败含义

- 声明不合法：改造时缺少约束字段，后续"默认拒绝"没有依据
- 覆盖不一致：有路由没被纳入管控，这就是默认放行的漏洞
