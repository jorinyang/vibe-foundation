# SPEC-OPS-03 负向用例

## 动作与期望

1. 项目根既没有 `package.json`，也没有其他 manifest
   → 子判定 `FAIL`，提示「未找到 package.json（未声明 ≠ 不需要）」，退出码 `1`

2. Python 栈但只有 `requirements.txt` 之外的文件
   → 子判定 `FAIL`

3. `.vibe/config.json` 缺少 `runtimeDeps`
   → 子判定 `FAIL`，退出码 `1`

## 失败含义

第 1 条是这条判定存在的理由：**YSCOT 就是这样通过的**——它没有 package.json，只用 Node 内置模块，`OPS-02` 显示"全部 import 已覆盖"。

实际上它完全没有依赖治理。**"没声明"和"不需要"是两件事，判定必须要求显式表达前者。**
