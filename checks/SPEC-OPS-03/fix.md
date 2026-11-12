# SPEC-OPS-03 处方

## 动作

1. 在项目根创建 manifest：
   - TypeScript / Node → `package.json`，至少写 `{ "name": "...", "version": "0.0.0", "dependencies": {} }`
   - Python → `pyproject.toml` 或 `requirements.txt`
   - 项目结构特殊时，可在 `.vibe/config.json` 的 `runtimeDeps.manifest` 指定文件列表
2. **空声明是合法的**：确实没有第三方依赖时，写空的 `dependencies: {}` 即可
3. 重跑验证命令

## 判定通过条件

```bash
vibe-check SPEC-OPS-03 --project .
```

退出码 `0`。

## 不可自动修复时

若项目是由其他工具生成的、manifest 放在非标准位置，用 `runtimeDeps.manifest` 指定实际路径；**不要为了让判定过而在空目录建一个假 manifest**——那条路径上的 `SPEC-OPS-02` 会接着验内容。
