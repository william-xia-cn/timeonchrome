# V0 发布复验

## 目标
在可执行发布环境中按标准流程复验，不做功能开发。

## 标准命令顺序
1. `for f in tests/unit/*.test.js; do node "$f" || exit 1; done`
2. `node tests/api/workers.test.js`
3. `npx playwright test tests/e2e/extension.test.js --config=playwright.config.js`
4. `node tests/run-all.js`

## 判定规则
- 先区分失败是**代码问题**还是**环境问题**。
- 必须保留原始输出与 `test-results/` 产物。
- 未完成证据留档，不得给“可发布”结论。

## 约束
- 不改业务代码
- 不扩展到 V1
