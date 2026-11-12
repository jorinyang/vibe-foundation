# SPEC-OPS-02 正向用例

## 前提

`.vibe/config.json`：

```json
{ "runtimeDeps": { "stack": "ts", "sourceDirs": ["src"] } }
```

`.vibe/runtime-deps.json`：

```json
{ "version": 1, "stack": "ts", "runtime": ["zod"] }
```

`src/` 下所有 import 的第三方包都在 `runtime` 里；相对路径与 Node 内置模块不计。

## 动作

```bash
vibe-check SPEC-OPS-02 --project .
```

## 期望

退出码 `0`。

## 失败含义

未声明的依赖 = 部署环境缺包。同时这条守住"底座不进运行时"——底座的包只要出现在运行依赖里就会被点名。
