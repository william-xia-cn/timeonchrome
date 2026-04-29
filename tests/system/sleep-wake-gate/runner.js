#!/usr/bin/env node
// runner.js — Sleep / Wake / Offline Gate 主入口（CLI）

const path = require('path');

// 解析 CLI 参数
function parseArgs(argv) {
  const args = {
    scenario: 'dry-run',
    outputDir: path.resolve(__dirname, 'reports'),
    reset: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--scenario' || arg.startsWith('--scenario=')) {
      args.scenario = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--output-dir' || arg.startsWith('--output-dir=')) {
      args.outputDir = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--reset') {
      args.reset = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
用法: node runner.js [选项]

选项:
  --scenario=<name>    选择测试场景 (默认: dry-run)
                       可用: dry-run
                       占位（未实现）: chrome-restart, sleep-wake, network-offline
  --output-dir=<path>  报告输出目录 (默认: tests/system/sleep-wake-gate/reports)
  --reset              测试前重置 calibration 数据
  --verbose            打印详细日志
  --help, -h           显示帮助

示例:
  node runner.js --scenario=dry-run
  node runner.js --scenario=dry-run --reset --verbose
  node runner.js --scenario=dry-run --output-dir=dist/system-reports
`);
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`[runner] 场景: ${args.scenario}`);
  console.log(`[runner] 输出目录: ${args.outputDir}`);
  if (args.reset) console.log('[runner] 重置 calibration: 是');
  if (args.verbose) console.log('[runner] 详细模式: 是');
  console.log('');

  // Phase 1 安全边界：只允许 dry-run
  if (args.scenario !== 'dry-run') {
    console.error(`[runner] 错误: 场景 '${args.scenario}' 在 Phase 1 中不可用。`);
    console.error('[runner] 当前仅支持 --scenario=dry-run');
    console.error('[runner] Phase 2/3/4 (chrome-restart, sleep-wake, network-offline) 将在后续阶段实现。');
    process.exit(1);
  }

  const { runDryRun } = require('./scenarios/dry-run');

  const startTime = Date.now();
  const result = await runDryRun({
    reset: args.reset,
    verbose: args.verbose,
    outputDir: args.outputDir,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log(`[runner] 执行耗时: ${elapsed} 秒`);

  if (result.success) {
    console.log(`[runner] 结果: PASS`);
    console.log(`[runner] JSON 报告: ${result.jsonPath}`);
    console.log(`[runner] Markdown 报告: ${result.mdPath}`);
    process.exit(0);
  } else {
    console.error(`[runner] 结果: FAIL`);
    if (result.summary?.error) {
      console.error(`[runner] 错误: ${result.summary.error}`);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[runner] 未捕获的异常:', err.message);
  process.exit(1);
});
