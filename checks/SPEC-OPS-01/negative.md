# SPEC-OPS-01 负向用例

## 前提

同一份 `.vibe/config.json`，把 `service.startCommand` 指向不同行为的夹具服务。

## 动作与期望

1. `/ready` 返回 `{"status":"ready"}`（无 `checks`）
   → 子判定「ready 含 checks」`FAIL`，退出码 `1`

2. `/ready` 返回 `500`
   → 子判定「ready 返回 JSON」`FAIL`，退出码 `1`

3. `startCommand` 指向一个立刻退出的进程
   → 子判定「服务启动」`FAIL`，退出码 `1`，提示服务提前退出

4. `startCommand` 指向一个能跑但不在 `baseUrl` 监听的进程
   → 子判定「服务启动」`FAIL`，退出码 `1`，提示在 N ms 内未就绪

## 失败含义

第 1 条最关键：**没有 checks 的 ready 等于告诉负载均衡"我永远是好的"**。这条不红，OPS 层就是装饰品。

第 3、4 条验证 probe 的失败路径——如果服务起不来但判定却报 PASS，那这个 probe 从来没有真正连上过服务。
