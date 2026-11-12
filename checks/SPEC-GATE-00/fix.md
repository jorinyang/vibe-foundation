# SPEC-GATE-00 处方

## 动作

1. 先让基线通过：`vibe-check SPEC-AUTH-01 --project .` 退出码 0
2. 确认 `.vibe/routes.json` 至少有一条 `visibility: "public"` 路由
3. 重跑 `vibe-check SPEC-GATE-00 --project .`

## 判定通过条件

```bash
vibe-check SPEC-GATE-00 --project .
```

退出码 `0`。

## 不可自动修复时

若注入后仍然通过，说明判定实现有 bug 或判定被短路——**这是底座自身的缺陷**，需要修判定，不是给项目加豁免。
