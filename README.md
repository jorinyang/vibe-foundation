# vibe-foundation

**通用工程化底座。**

<div align="center">

<p><strong>把 vibecoding 项目从「能跑」推到「能安全上线」。</strong></p>

<p>
  <a href="https://github.com/jorinyang/vibe-foundation/releases"><img src="https://img.shields.io/github/v/release/jorinyang/vibe-foundation?style=flat-square&color=CBF74E" alt="Release" height="20"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node 20+" height="20"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-3355FF?style=flat-square" alt="Apache License 2.0" height="20"></a>
  <a href="#"><img src="https://img.shields.io/badge/SPEC-0.11.0-8B5CF6?style=flat-square" alt="SPEC 0.11.0" height="20"></a>
  <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-CBF74E?style=flat-square" alt="PRs welcome" height="20"></a>
</p>

<img src="docs/images/hero.jpg" alt="vibe-foundation：四层工程化护栏——规范契约、结构约束、门禁判定、应用改造" width="100%" />

</div>

vibecoding 让功能验证变得极快，但「能跑」到「能安全上线」之间那段工程化工作没有对应的加速器。每次都要从头补权限、门禁、环境、身份，补的方式每次不同，补完没人验证。

vibe-foundation 给的不是模板，而是一组**可执行、可被违反的判定**：改造落在项目里，底座留在项目外。

- **十二条判定**，覆盖规范、结构、门禁、应用四层；
- **五种判定模式**：声明对账、运行时探测、行为验证、静态分析、门禁元验收；
- **四十九条例行用例**，每条判定都有正负两向；
- **可被违反**：门禁元验收会主动注入违规，验证判定真的会红；
- **语言无关优先**：十二条里只有两条需要分技术栈实现。

---

## 当前状态

| 项 | 值 |
|---|---|
| 规范版本 | `0.11.0` |
| 判定条目 | 12 条（全部实现） |
| 端到端用例 | 49 条（正向 + 负向，全绿） |
| 架构决策记录 | 4 份（ADR-001 至 ADR-004） |

| 判定 | 模式 | 验的是什么 |
|---|---|---|
| `SPEC-STR-01` | declaration | 项目宪法 ≤150 行；底座版本引用与实际一致 |
| `SPEC-AUTH-01` | declaration | 路由声明合法；声明与实际一致；public 必须带理由；实际来源必须独立可信 |
| `SPEC-AUTH-02` | behavior | 双身份越权隔离；拒绝响应不得泄露他人资源标识 |
| `SPEC-MCP-01` | declaration | 对外工具声明身份模式；工具资源域须已在路由清单声明 |
| `SPEC-MCP-02` | behavior | 服务身份不得调用户级工具；无身份必须被拒 |
| `SPEC-OPS-01` | probe | 真起服务，存活与就绪语义分离，就绪含依赖清单 |
| `SPEC-ENV-01` | behavior | 缺必需环境变量时启动必须失败 |
| `SPEC-OPS-02` | static | import 的第三方包 ⊆ 运行依赖声明 |
| `SPEC-OPS-03` | static | 运行期依赖必须显式声明（空声明也算） |
| `SPEC-SEC-01` | static | 仓库无密钥（接入现成扫描器，底座不自研） |
| `SPEC-STRUCT-01` | static | 无循环依赖；跨层调用符合声明的依赖方向 |
| `SPEC-GATE-00` | meta | 门禁元验收：注入违规必须变红 |

---

## 四层怎么接线

```
                    L1 规范契约（唯一真源，条目带 ID）
                              │ 只允许引用，不允许重述
        ┌──────────────┬──────┴───────┬──────────────┐
        ▼              ▼              ▼              ▼
   结构约束        门禁判定        应用改造         回流
   环境/分层      统一检查命令   权限/对外工具   改造日志→ADR
        └──────────────┴──────────────┘
              全部由同一个 vibe-check 执行
```

- **L1 到 L3 成本恒定**：做一次，所有项目复用
- **L4 成本随项目数增长**：所以交付的是「协议 + 判定」，不是权限实现

---

## 用法

```bash
# 单条判定
vibe-check SPEC-OPS-01 --project /path/to/project

# 全部判定的 gap 报告
vibe-check plan --project .

# 门禁模式：退出码 + 可选 SARIF
vibe-check all --project . --ci --sarif out.sarif

# 公开面清单：公开路由 + 理由 + 占比告警
vibe-check report-public --project .

# 在项目里生成 .vibe 模板
vibe-check init --project .

# 底座自检：四十九条正负向用例
vibe-check --self-test
```

退出码：`0` 通过 / `1` 失败 / `2` 配置错误 / `3` 判定崩溃。

**判定状态只有五种**：`PASS` / `FAIL` / `SKIP` / `CRASH` / `CONFIG`。没有「未知」——不知道就是失败。

- `SKIP` 表示有有效期内的豁免，需负责人与到期日，过期自动变回失败
- 豁免不算通过

---

## 真实项目效果

在一个真实的课堂运营系统（新加坡服务器的生产项目）上做了完整改造试点：

| 指标 | 结果 |
|---|---|
| 十二条判定 | **11 条通过、1 条有期豁免、0 条失败** |
| 路由声明覆盖 | 110 条路由，27 条公开、83 条受保护 |
| 对外工具声明 | 21 个工具全部声明身份模式 |
| 身份模式灵敏度 | 把服务令牌换成有效用户令牌后，判定**立即变红** |
| 公开面占比 | 24.5%，触发 20% 告警阈值 |

另外在 9 个真实项目上做过只读验证，累计 33 次判定运行，**零误报**。

---

## 项目侧要放的文件

`.vibe/` 目录（`vibe-check init` 可生成模板）：

| 文件 | 作用 |
|---|---|
| `ref.json` | `{"spec":"0.11.0"}` 锁定的底座版本 |
| `config.json` | 路由来源、服务启动方式、各类探测配置 |
| `routes.json` | 路由声明：公开必带理由，受保护必带资源与动作 |
| `routes.actual.json` | 实际路由表（文件模式，必须标注来源可信度） |
| `mcp-tools.json` | 对外工具声明：身份模式、资源域 |
| `runtime-deps.json` | 运行期依赖声明 |
| `override/<ID>.md` | 有期限的豁免 |

---

## 目录

```
bin/vibe-check.mjs   命令行：单条 / 计划 / 全量 / 公开面 / 初始化 / 自检
checks/              判定目录（每条：meta / positive / negative / fix）
spec/spec.json       规范契约唯一真源
spec/build-index.mjs 反向索引生成与死条款检测
ci/                  平台无关门禁封装
test/smoke.mjs       四十九条端到端用例
test/guard.mjs       防退化检查
docs/images/         主视觉
```

---

## 开发

```bash
npm run build-spec   # 重新生成反向索引，检测死条款
npm test             # 防退化检查 + 全部端到端用例
```

改判定必须同时补正负向用例，否则自检会红。

---

## 设计文档

分层设计、判定规范、任务拆解与架构决策记录，维护在项目外的知识库中；本仓库只保留可执行部分。

---

## License

Apache License 2.0 — 见 [LICENSE](LICENSE)。
