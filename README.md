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

SPEC `0.8.0`：**11 条契约全部实现**，五种判定模式（declaration / probe / behavior / static / meta）。

| 判定 | 模式 | 验的是什么 |
|---|---|---|
| `SPEC-STR-01` | declaration | 项目宪法 ≤150 行；底座版本引用与实际一致 |
| `SPEC-AUTH-01` | declaration | 路由声明合法；声明与实际一致；public 必须带理由 |
| `SPEC-AUTH-02` | behavior | 双身份越权隔离；拒绝响应不得泄露他人资源标识 |
| `SPEC-MCP-01` | declaration | MCP 工具声明 `auth_mode`；能力须已在路由清单声明 |
| `SPEC-MCP-02` | behavior | 服务身份不得调用户级工具；无身份必须被拒 |
| `SPEC-OPS-01` | probe | 真起服务，health / ready 语义分离，ready 含 `checks` |
| `SPEC-ENV-01` | behavior | 缺必需环境变量时启动必须失败 |
| `SPEC-OPS-02` | static | import 的第三方包 ⊆ 运行依赖声明 |
| `SPEC-SEC-01` | static | 仓库无密钥（接入现成扫描器，底座不自研） |
| `SPEC-STRUCT-01` | static | 无循环依赖；跨层调用符合声明的依赖方向 |
| `SPEC-GATE-00` | meta | 门禁元验收：注入违规必须变红 |

**46 条端到端用例（正向 + 负向）全绿。**

其中只有 `SPEC-OPS-02` 与 `SPEC-STRUCT-01` 是语言相关的（TS / Python 各一套实现，两栈都有正负向用例覆盖），其余九条语言无关。

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

# 底座自检（全部正负向用例）
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
| `ref.json` | `{"spec":"0.8.0"}` — 锁定的底座版本 |
| `config.json` | 全局配置，见下 |
| `routes.json` | 路由声明：`public` 必带 `reason`（≥8 字），`protected` 必带 `resource/action/subjects` |
| `routes.actual.json` | 实际路由表（`routeSource.type = "file"` 时用） |
| `mcp-tools.json` | MCP 工具声明：`auth_mode` / `service_scope` / `subjects` |
| `runtime-deps.json` | 运行期依赖声明 |
| `override/<ID>.md` | 有期限的豁免 |

`config.json` 的段：

```jsonc
{
  "routeSource": { "type": "file" | "endpoint", "path": "...", "url": "..." },
  "service": { "startCommand": "npm start", "baseUrl": "http://127.0.0.1:3000", "startupTimeoutMs": 15000, "env": {} },
  "endpoints": { "health": "/health", "ready": "/ready" },
  "authzProbe": { "pathTemplate": "/api/orders/{id}", "userA": {}, "userB": {}, "denyStatus": [403, 404] },
  "mcpProbe": { "path": "/mcp", "toolName": "update_order", "serviceToken": "...", "userToken": "..." },
  "envProbe": { "required": ["DATABASE_URL"], "timeoutMs": 5000 },
  "security": { "scannerCommand": "gitleaks detect --redact" },
  "runtimeDeps": { "stack": "ts" | "python", "sourceDirs": ["src"] },
  "structure": { "stack": "ts" | "python", "sourceDirs": ["src"], "layers": { "src/api": ["src/service"] } }
}
```

## 目录

```
bin/vibe-check.mjs   CLI：check / plan / all / report-public / init / --self-test
checks/              判定（每个 SPEC-ID 一个目录：meta / positive / negative / fix）
spec/spec.json       SPEC 契约（唯一真源）
spec/build-index.mjs 反向索引生成 + 死条款检测
ci/                  平台无关门禁封装（github-actions.yml / vibe-check.sh）
test/smoke.mjs       端到端用例（正向 + 负向）
test/guard.mjs       防退化检查（不许出现绝对路径与本地工作副本引用）
```

## 开发

```bash
npm run build-spec   # 重新生成 SPEC 反向索引，检测死条款
npm test             # 防退化检查 + 全部端到端用例
```

## 设计文档

CLARIFY / BRIEF / ARCHITECTURE / STANDARDS / TASKS 五份，维护在知识库 `Research/vibe/`；
另有两份交付文档：`AUTHZ_INTEGRATION.md`（四家 SSO 接入规范）、`RETROFIT_PLAYBOOK.md`（存量改造手册）。

## License

Apache-2.0（待补 LICENSE 文件）
