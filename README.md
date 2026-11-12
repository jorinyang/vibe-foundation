# vibe-foundation

vibecoding 椤圭洰鐨勯€氱敤宸ョ▼鍖栧簳搴с€?
搴曞骇鎻愪緵鍥涘眰璧勪骇锛宎gent 鎹鍦ㄦ棦鏈夐」鐩笂鎶娿€岃兘璺戙€嶆帹杩涘埌銆岃兘瀹夊叏涓婄嚎銆嶏細

| 灞?| 鍐呭 | 褰㈡€?|
|---|---|---|
| **L1 鏍囧噯灞?* | SPEC 濂戠害 | 绾鑼冿紝鏉＄洰鍖栧甫 ID |
| **L2 缁撴瀯灞?* | 鐜渚濊禆銆佹灦鏋勭害鏉?| 瑙勮寖 + 寮€鍙戞湡宸ュ叿 |
| **L3 闂ㄧ灞?* | CI 闂ㄧ | 鍩虹鍒ゅ畾 + 骞冲彴鏃犲叧鍛戒护 |
| **L4 搴旂敤灞?* | MCP 鏈嶅姟鎺ュ彛銆佹潈闄愮鐞?| 鎸夐」鐩姛鑳界偣/鏉冮檺鐐规敼閫犵殑鍗忚 |

鏍稿績涓嶆槸"缁欎竴濂楁ā鏉?锛屾槸**缁欎竴缁勫彲鎵ц銆佸彲琚繚鍙嶇殑鍒ゅ畾**銆傛敼閫犺惤鍦ㄩ」鐩噷锛屼笉钀藉湪搴曞骇閲屻€?
## 褰撳墠鐘舵€?
SPEC `0.11.0`锛?*12 鏉″绾﹀叏閮ㄥ疄鐜?*锛屼簲绉嶅垽瀹氭ā寮忥紙declaration / probe / behavior / static / meta锛夈€?
| 鍒ゅ畾 | 妯″紡 | 楠岀殑鏄粈涔?|
|---|---|---|
| `SPEC-STR-01` | declaration | 椤圭洰瀹硶 鈮?50 琛岋紱搴曞骇鐗堟湰寮曠敤涓庡疄闄呬竴鑷?|
| `SPEC-AUTH-01` | declaration | 璺敱澹版槑鍚堟硶锛涘０鏄庝笌瀹為檯涓€鑷达紱public 蹇呴』甯︾悊鐢?|
| `SPEC-AUTH-02` | behavior | 鍙岃韩浠借秺鏉冮殧绂伙紱鎷掔粷鍝嶅簲涓嶅緱娉勯湶浠栦汉璧勬簮鏍囪瘑 |
| `SPEC-MCP-01` | declaration | MCP 宸ュ叿澹版槑 `auth_mode`锛涜兘鍔涢』宸插湪璺敱娓呭崟澹版槑 |
| `SPEC-MCP-02` | behavior | 鏈嶅姟韬唤涓嶅緱璋冪敤鎴风骇宸ュ叿锛涙棤韬唤蹇呴』琚嫆 |
| `SPEC-OPS-01` | probe | 鐪熻捣鏈嶅姟锛宧ealth / ready 璇箟鍒嗙锛宺eady 鍚?`checks` |
| `SPEC-ENV-01` | behavior | 缂哄繀闇€鐜鍙橀噺鏃跺惎鍔ㄥ繀椤诲け璐?|
| `SPEC-OPS-02` | static | import 鐨勭涓夋柟鍖?鈯?杩愯渚濊禆澹版槑 |
| `SPEC-SEC-01` | static | 浠撳簱鏃犲瘑閽ワ紙鎺ュ叆鐜版垚鎵弿鍣紝搴曞骇涓嶈嚜鐮旓級 |
| `SPEC-STRUCT-01` | static | 鏃犲惊鐜緷璧栵紱璺ㄥ眰璋冪敤绗﹀悎澹版槑鐨勪緷璧栨柟鍚?|
| `SPEC-GATE-00` | meta | 闂ㄧ鍏冮獙鏀讹細娉ㄥ叆杩濊蹇呴』鍙樼孩 |

**49 鏉＄鍒扮鐢ㄤ緥锛堟鍚?+ 璐熷悜锛夊叏缁裤€?*

鍏朵腑鍙湁 `SPEC-OPS-02` 涓?`SPEC-STRUCT-01` 鏄瑷€鐩稿叧鐨勶紙TS / Python 鍚勪竴濂楀疄鐜帮紝涓ゆ爤閮芥湁姝ｈ礋鍚戠敤渚嬭鐩栵級锛屽叾浣欎節鏉¤瑷€鏃犲叧銆?
## 鐢ㄦ硶

```bash
# 鍗曟潯鍒ゅ畾
vibe-check SPEC-OPS-01 --project /path/to/project

# 鍏ㄩ儴鍒ゅ畾鐨?gap 鎶ュ憡锛堜汉璇伙級
vibe-check plan --project .

# 闂ㄧ妯″紡锛氶€€鍑虹爜 + 鍙€?SARIF
vibe-check all --project . --ci --sarif out.sarif

# 鍏紑闈㈡竻鍗曪紙public 璺敱 + 鐞嗙敱 + 鍗犳瘮鍛婅锛?vibe-check report-public --project .

# 鍦ㄩ」鐩噷鐢熸垚 .vibe/ 妯℃澘
vibe-check init --project .

# 搴曞骇鑷锛堝叏閮ㄦ璐熷悜鐢ㄤ緥锛?vibe-check --self-test
```

閫€鍑虹爜锛歚0` 閫氳繃 / `1` 澶辫触 / `2` 閰嶇疆閿欒 / `3` 鍒ゅ畾宕╂簝銆?
### 鍒ゅ畾鐘舵€?
`PASS` / `FAIL` / `SKIP` / `CRASH` / `CONFIG`銆?*娌℃湁 UNKNOWN** 鈥斺€?涓嶇煡閬撳氨鏄け璐ャ€?
- `SKIP` = 鏈夋湁鏁堟湡鍐呯殑璞佸厤锛坄.vibe/override/<SPEC-ID>.md`锛岄渶璐熻矗浜?+ 鍒版湡鏃?鈮?0 澶╋級
- 璞佸厤杩囨湡鑷姩鍙樺洖 `FAIL`锛涜眮鍏嶄笉绠?`PASS`

## 椤圭洰渚ц鏀剧殑鏂囦欢

`.vibe/` 鐩綍锛坄vibe-check init` 鍙敓鎴愭ā鏉匡級锛?
| 鏂囦欢 | 浣滅敤 |
|---|---|
| `ref.json` | `{"spec":"0.11.0"}` 鈥?閿佸畾鐨勫簳搴х増鏈?|
| `config.json` | 鍏ㄥ眬閰嶇疆锛岃涓?|
| `routes.json` | 璺敱澹版槑锛歚public` 蹇呭甫 `reason`锛堚墺8 瀛楋級锛宍protected` 蹇呭甫 `resource/action/subjects` |
| `routes.actual.json` | 瀹為檯璺敱琛紙`routeSource.type = "file"` 鏃剁敤锛?|
| `mcp-tools.json` | MCP 宸ュ叿澹版槑锛歚auth_mode` / `service_scope` / `subjects` |
| `runtime-deps.json` | 杩愯鏈熶緷璧栧０鏄?|
| `override/<ID>.md` | 鏈夋湡闄愮殑璞佸厤 |

`config.json` 鐨勬锛?
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

## 鐩綍

```
bin/vibe-check.mjs   CLI锛歝heck / plan / all / report-public / init / --self-test
checks/              鍒ゅ畾锛堟瘡涓?SPEC-ID 涓€涓洰褰曪細meta / positive / negative / fix锛?spec/spec.json       SPEC 濂戠害锛堝敮涓€鐪熸簮锛?spec/build-index.mjs 鍙嶅悜绱㈠紩鐢熸垚 + 姝绘潯娆炬娴?ci/                  骞冲彴鏃犲叧闂ㄧ灏佽锛坓ithub-actions.yml / vibe-check.sh锛?test/smoke.mjs       绔埌绔敤渚嬶紙姝ｅ悜 + 璐熷悜锛?test/guard.mjs       闃查€€鍖栨鏌ワ紙涓嶈鍑虹幇缁濆璺緞涓庢湰鍦板伐浣滃壇鏈紩鐢級
```

## 寮€鍙?
```bash
npm run build-spec   # 閲嶆柊鐢熸垚 SPEC 鍙嶅悜绱㈠紩锛屾娴嬫鏉℃
npm test             # 闃查€€鍖栨鏌?+ 鍏ㄩ儴绔埌绔敤渚?```

## 璁捐鏂囨。

CLARIFY / BRIEF / ARCHITECTURE / STANDARDS / TASKS 浜斾唤锛岀淮鎶ゅ湪鐭ヨ瘑搴?`Research/vibe/`锛?鍙︽湁涓や唤浜や粯鏂囨。锛歚AUTHZ_INTEGRATION.md`锛堝洓瀹?SSO 鎺ュ叆瑙勮寖锛夈€乣RETROFIT_PLAYBOOK.md`锛堝瓨閲忔敼閫犳墜鍐岋級銆?
## License

Apache License 2.0 鈥?瑙?[LICENSE](LICENSE)銆?