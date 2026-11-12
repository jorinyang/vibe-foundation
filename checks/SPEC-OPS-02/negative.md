# SPEC-OPS-02 负向用例

## 动作与期望

1. 代码 `import 'express'`，但 `runtime` 里没有
   → 子判定 `FAIL`，提示"1 个包未声明（express）"，退出码 `1`

2. 缺少 `.vibe/runtime-deps.json`
   → 子判定 `FAIL`

3. `sourceDirs` 下没有任何源码文件
   → 子判定「扫描源码」`FAIL`（防"扫了个空目录就通过"）

## 失败含义

第 3 条是防伪的关键：**目录配错时，扫描 0 个文件也会"全部覆盖"，这是最隐蔽的假通过。**
