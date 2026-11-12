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

SPEC `0.3.0`，三条判定已实现，覆盖三种判定模式：

| 判定 | 模式 | 验的是什么 |
|---|---|---|
| `SPEC-STR-01` | declaration | 项目宪法 ≤150 行；底座版本引用与实际一致 |
| `SPEC-AUTH-01` | declaration | 路由声明合法；声明与实际路由一致；public 必须带理由 |
| `SPEC-OPS-01` | probe | 真起服务，验 health / ready 语义分离，ready 含 `checks` |

13 条端到端用例（正向 + 负向）全绿。

## 用法

```bash
# 跑单条判定
node bin/vibe-check.mjs SPEC-OPS-01 --project /path/to/project

# 机器可读输出
node bin/vibe-check.mjs SPEC-AUTH-01 --project . --json

# 全部判定的正负向用例自检
node bin/vibe-check.mjs --self-test
```

退出码：`0` 通过 / `1` 失败 / `2` 配置错误 / `3` 判定崩溃。

## 项目侧要放的文件

`.vibe/` 目录：

| 文件 | 作用 |
|---|---|
| `ref.json` | `{"spec":"0.3.0"}` — 锁定的底座版本 |
| `config.json` | `routeSource`（file / endpoint）、`service`（startCommand / baseUrl）、`endpoints` |
| `routes.json` | 路由声明：`visibility: public` 必带 `reason`（≥8 字），`protected` 必带 `resource/action/subjects` |
| `routes.actual.json` | 实际路由表（`routeSource.type = "file"` 时用） |

`.vibe/config.json` 示例：

```json
{
  "routeSource": { "type": "file", "path": ".vibe/routes.actual.json" },
  "service": {
    "startCommand": "npm start",
    "baseUrl": "http://127.0.0.1:3000",
    "startupTimeoutMs": 15000
  },
  "endpoints": { "health": "/health", "ready": "/ready" }
}
```

## 目录

```
bin/            vibe-check 命令行入口
checks/         判定（每个 SPEC-ID 一个目录：meta / positive / negative / fix）
spec/           SPEC 契约（spec.json 是唯一真源）
test/           夹具服务 + 端到端 smoke
```

## 设计文档

CLARIFY / BRIEF / ARCHITECTURE / STANDARDS / TASKS 五份，维护在知识库 `Research/vibe/`。

## License

Apache-2.0（待补 LICENSE 文件）
