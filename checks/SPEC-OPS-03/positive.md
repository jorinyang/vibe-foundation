# SPEC-OPS-03 正向用例

## 前提

`.vibe/config.json` 有 `runtimeDeps`：

```json
{ "runtimeDeps": { "stack": "ts", "sourceDirs": ["src"] } }
```

项目根存在 `package.json`（`dependencies` 可以为空）。

## 动作

```bash
vibe-check SPEC-OPS-03 --project .
```

## 期望

退出码 `0`：子判定显示"找到 package.json"。

## 失败含义

零声明项目会让 `SPEC-OPS-02` 平凡通过——「import ⊆ 空集合」永远成立。这条判定把前提条件单独拎出来验。
