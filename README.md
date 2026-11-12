# vibe-foundation

vibecoding 项目的通用工程化底座。

底座提供四层资产，agent 据此在既有项目上把「能跑」推进到「能安全上线」：

| 层 | 内容 | 形态 |
|---|---|---|
| **L1 标准层** | SPEC 契约 | 纯规范，条目化带 ID |
| **L2 结构层** | 环境依赖、架构约束 | 规范 + 开发期工具 |
| **L3 门禁层** | CI 门禁 | 基础判定 + 平台无关命令 |
| **L4 应用层** | MCP 服务接口、权限管理 | 按项目功能点/权限点改造的协议 |

核心不是"给一套模板"，是**给一组可执行、可被违反的判定**。改造落在项目里，不落在底座里。

## 当前状态

Phase 0 · 第一条判定 `SPEC-STR-01` 已跑通（零外部依赖，打通 spec → check → CLI → 报告 → 处方 全链路）。

## 用法

```bash
# 检查某个项目
node bin/vibe-check.mjs SPEC-STR-01 --project /path/to/project

# 机器可读输出
node bin/vibe-check.mjs SPEC-STR-01 --project . --json
```

退出码：`0` 通过 / `1` 失败 / `2` 配置错误 / `3` 判定崩溃。

## 目录

```
bin/            vibe-check 命令行入口
checks/         判定（每个 SPEC-ID 一个目录：meta / positive / negative / fix）
spec/           SPEC 契约（spec.json 是唯一真源）
```

## 设计文档

CLARIFY / BRIEF / ARCHITECTURE / STANDARDS / TASKS 五份，维护在知识库 `Research/vibe/`。

## License

Apache-2.0（待补 LICENSE 文件）
