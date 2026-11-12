# SPEC-STRUCT-01 负向用例

## 动作与期望

1. `src/a.ts` import `./b`，`src/b.ts` import `./a`
   → 子判定「无循环依赖」`FAIL`，退出码 `1`

2. `src/service/b.ts` import `../api/c`（反向依赖）
   → 子判定「依赖方向符合声明」`FAIL`

3. `sourceDirs` 下没有源码文件
   → 子判定「扫描依赖图」`FAIL`

## 失败含义

第 1 条不红说明图根本没建起来；第 2 条不红说明分层只是写在配置里的装饰。
