# SPEC-STRUCT-01 正向用例

## 前提

`.vibe/config.json`：

```json
{ "structure": { "stack": "ts", "sourceDirs": ["src"],
  "layers": { "src/api": ["src/service"], "src/service": [] } } }
```

- `src/api/**` 可以 import `src/service/**`，不能反向
- 没有循环依赖

## 动作

```bash
vibe-check SPEC-STRUCT-01 --project .
```

## 期望

退出码 `0`。

## 失败含义

循环依赖会让 agent 每次改动都牵连全库——这是项目在第 200 次迭代后失控的主因。
