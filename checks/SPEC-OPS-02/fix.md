# SPEC-OPS-02 处方

## 动作

1. 打开 `.vibe/runtime-deps.json`，把缺的包加进 `runtime` 数组
2. 如果这个包其实只在开发期用（测试、构建、类型），把它挪进 devDependencies，**不要**写进 `runtime`
3. 如果这个包根本不需要，删掉对应的 import
4. 重跑验证命令

## 判定通过条件

```bash
vibe-check SPEC-OPS-02 --project .
```

退出码 `0`。

## 不可自动修复时

若源码目录不在 `src`，改 `runtimeDeps.sourceDirs`；**不要为了过判定把 `sourceDirs` 指向空目录**——第 3 条子判定会把它抓出来。
