# SPEC-STR-01 负向用例

## 前提

同正向用例，另准备两份故意做错的副本。

## 动作

1. 把 `.vibe/ref.json` 的 `spec` 改成 `0.0.9`
2. 执行 `node bin/vibe-check.mjs SPEC-STR-01 --project ./fixture-bad-version`
3. 把 `AGENTS.md` 扩到 200 行
4. 执行 `node bin/vibe-check.mjs SPEC-STR-01 --project ./fixture-long-constitution`

## 期望

1. 子判定「版本对账」`FAIL`，退出码 `1`，提示项目声明 `0.0.9`、底座实际 `0.1.0`
2. 子判定「宪法单屏」`FAIL`，退出码 `1`，提示 200 行超过 150

## 失败含义

如果这两个负向用例不红，说明该判定退化成了「文件存在性检查」——按 STANDARDS 反模式 #10，那是 0 分验证，agent 一个空文件就能过。
