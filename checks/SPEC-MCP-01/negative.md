# SPEC-MCP-01 负向用例

## 动作与期望

1. 某个工具删掉 `auth_mode`
   → 子判定「声明合法」`FAIL`，退出码 `1`

2. `service` 工具写成 `service_scope: ["*"]`
   → 子判定「声明合法」`FAIL`，提示不得为通配

3. `user` 工具的 `subjects` 为空数组
   → 子判定「声明合法」`FAIL`

4. 工具声明 `resource: "refund", action: "write"`，但 `routes.json` 里没有对应能力
   → 子判定「能力在路由清单中已声明」`FAIL`

## 失败含义

第 2 条最关键：**`service_scope: ["*"]` 等于给 agent 一把万能钥匙**。这条不红，「服务身份受限」就是空话。
