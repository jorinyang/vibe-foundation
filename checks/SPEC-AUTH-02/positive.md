# SPEC-AUTH-02 正向用例

## 前提

`.vibe/config.json` 里有 `service`，以及 `authzProbe`：

```json
{
  "authzProbe": {
    "method": "GET",
    "pathTemplate": "/api/orders/{id}",
    "tokenHeader": "authorization",
    "userA": { "token": "Bearer token-a", "resourceId": "ord-aaa" },
    "userB": { "token": "Bearer token-b", "resourceId": "ord-bbb" },
    "denyStatus": [403, 404]
  }
}
```

- A、B 是两个真实用户，各有自己的一个资源
- A 读自己的资源 → 2xx
- A 读 B 的资源 → 403 或 404，且响应体不含 B 的资源标识

## 动作

```bash
node bin/vibe-check.mjs SPEC-AUTH-02 --project .
```

## 期望

退出码 `0`，五条子判定全 `PASS`：服务启动、A 读自己对、A 读 B 被拒、B 读自己对、越权响应不泄露。

## 失败含义

- A 读自己也不通：鉴权链路本身是坏的，这个 probe 没验到真实的东西
- A 读 B 通过：越权，最严重
- 403 但响应里带出 B 的数据：比越权更隐蔽，日志看起来是"已拒绝"
