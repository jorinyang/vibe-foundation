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

SPEC `0.5.0`：11 条契约（4 条已实现、7 条待实现），四种判定模式全打通。

| 判定 | 模式 | 验的是什么 |
|---|---|---|
| `SPEC-STR-01` | declaration | 项目宪法 ≤150 行；底座版本引用与实际一致 |
| `SPEC-AUTH-01` | declaration | 路由声明合法；声明与实际路由一致；public 必须带理由 |
| `SPEC-AUTH-02` | behavior | 双身份越权隔离；拒绝响应不得泄露他人资源标识 |
| `SPEC-OPS-01` | probe | 真起服务，health / ready 语义分离，ready 含 `checks` |

22 条端到端用例（正向 + 负向）全绿。

## 用法

```bash
# 单条判定
vibe-check SPEC-OPS-01 --project /path/to/project

# 全部判定的 gap 报告（人读）
vibe-check plan --project .

# 门禁模式：退出码 + 可选 SARIF
vibe-check all --project . --ci --sarif out.sarif

# 公开面清单（public 路由 + 理由 + 占比告警）
vibe-check report-public --project .

# 在项目里生成 .vibe/ 模板
vibe-check init --project .

# 底座自检（正负向全跑）
vibe-check --self-test
```

退出码：`0` 通过 / `1` 失败 / `2` 配置错误 / `3` 判定崩溃。

### 判定状态

`PASS` / `FAIL` / `SKIP` / `CRASH` / `CONFIG`。**没有 UNKNOWN** —— 不知道就是失败。

- `SKIP` = 有有效期内的豁免（`.vibe/override/<SPEC-ID>.md`，需负责人 + 到期日 ≤90 天）
- 豁免过期自动变回 `FAIL`；豁免不算 `PASS`

## 项目侧要放的文件

`.vibe/` 目录（`vibe-check init` 可生成模板）：

| 文件 | 作用 |
|---|---|
| `ref.json` | `{"spec":"0.5.0"}` — 锁定的底座版本 |
| `config.json` | `routeSource`（file / endpoint）、`service`、`endpoints`、`authzProbe` |
| `routes.json` | 路由声明：`public` 必带 `reason`（≥8 字），`protected` 必带 `resource/action/subjects` |
| `routes.actual.json` | 实际路由表（`routeSource.type = "file"` 时用） |
| `override/<ID>.md` | 有期限的豁免 |

## 目录

```
bin/vibe-check.mjs   CLI：check / plan / all / report-public / init / --self-test
checks/              判定（每个 SPEC-ID 一个目录：meta / positive / negative / fix）
spec/spec.json       SPEC 契约（唯一真源）
spec/build-index.mjs 反向索引生成 + 死条款检测
test/smoke.mjs       端到端用例（正向 + 负向）
test/guard.mjs       防退化检查（不许出现绝对路径与本地工作副本引用）
```

## 开发

```bash
npm run build-spec   # 重新生成 SPEC 反向索引，检测死条款
npm test             # 防退化检查 + 全部端到端用例
```

## 设计文档

CLARIFY / BRIEF / ARCHITECTURE / STANDARDS / TASKS 五份，维护在知识库 `Research/vibe/`。

## License

Apache-2.0（待补 LICENSE 文件）
