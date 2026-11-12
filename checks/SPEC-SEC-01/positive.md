# SPEC-SEC-01 正向用例

## 前提

`.vibe/config.json` 配置了外部扫描器：

```json
{ "security": { "scannerCommand": "gitleaks detect --no-banner --redact" } }
```

扫描器在项目根执行，退出码 `0` 表示无命中。

## 动作

```bash
vibe-check SPEC-SEC-01 --project .
```

## 期望

退出码 `0`。

## 失败含义

底座不自研扫描器（BRIEF 第 8 条），只负责编排与判读退出码。所以这条判定验的是"有没有接入扫描器"，不是"扫描器写得对不对"。
