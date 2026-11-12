# SPEC-STR-01 处方

## 动作

1. 打开 `.vibe/ref.json`
2. 把 `spec` 字段改成底座 `spec/spec.json` 里的 `version` 值（当前 `0.1.0`）
3. 若宪法超长，把 `AGENTS.md` 里「背景 / 历史 / 变更来由」类段落移到 `docs/`，只留规则、入口、禁止项
4. 重跑验证命令

## 判定通过条件

```bash
node bin/vibe-check.mjs SPEC-STR-01 --project .
```

退出码 `0`，两条子判定均 `PASS`。

## 不可自动修复时

若项目是**故意锁定旧版本**（例如线上冻结），写 `.vibe/override/SPEC-STR-01.md`，格式按 STANDARDS §7：负责人 + 到期日（≤90 天）+ 理由 + 影响面 + 复审方式。豁免状态是 `SKIP`，不算 `PASS`。
