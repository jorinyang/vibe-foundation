# SPEC-ENV-01 正向用例

## 前提

`.vibe/config.json` 有 `service` 与 `envProbe`：

```json
{ "envProbe": { "required": ["VIBE_REQUIRED_TOKEN"], "timeoutMs": 5000 } }
```

服务在启动时校验该变量，缺失即 `exit(1)`。

## 动作

```bash
vibe-check SPEC-ENV-01 --project .
```

## 期望

退出码 `0`：子判定显示"以非零码退出"。

## 失败含义

若服务缺变量仍能启动，说明配置错误会被推到运行期才炸——现场看不出是配置问题。
