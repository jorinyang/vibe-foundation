# SPEC-STR-01 正向用例

## 前提

- 项目根有 `AGENTS.md`，行数 ≤ 150
- `.vibe/ref.json` 存在，`{"spec": "<底座 spec/spec.json 的 version>"}`
- 底座与项目在同一台机器上

## 动作

```bash
node bin/vibe-check.mjs SPEC-STR-01 --project .
```

## 期望

- 退出码 `0`
- 输出两条子判定均 `PASS`
- 输出中显示宪法实际行数（≤ 150）

## 失败含义

- 宪法超长：agent 读不完入口契约，后续 L2–L4 判定会被选择性忽略
- 版本不一致：项目按旧规范在改，判定结果不可信，等于没验
