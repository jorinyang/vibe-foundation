# SPEC-SEC-01 处方

## 动作

1. 选一个现成扫描器：`gitleaks`（推荐）、`trufflehog`、或语言生态自带工具
2. 把命令写进 `.vibe/config.json`：

```json
{ "security": { "scannerCommand": "gitleaks detect --no-banner --redact", "timeoutMs": 120000 } }
```

3. 先在本地跑一遍，确认命令本身能工作（返回 0 或 1，不是"命令不存在"）
4. 重跑验证命令

## 判定通过条件

```bash
vibe-check SPEC-SEC-01 --project .
```

退出码 `0`。

## 不可自动修复时

历史仓库里可能确有已泄露的密钥。**不要把扫描器改成只报不挂**——先轮换密钥，再从历史里清除，最后让判定转绿。豁免不适用于本条。
