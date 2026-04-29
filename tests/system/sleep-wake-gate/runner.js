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
    userDataDir: null,
    preActiveSeconds: 60,
    closedSeconds: 120,
    postRestartSeconds: 30,
    sleepSeconds: 180,
    postWakeSeconds: 30,
    allowSystemSleep: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--scenario' || arg.startsWith('--scenario=')) {
      args.scenario = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--output-dir' || arg.startsWith('--output-dir=')) {
      args.outputDir = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--user-data-dir' || arg.startsWith('--user-data-dir=')) {
      args.userDataDir = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--reset') {
      args.reset = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--allowSystemSleep') {
      args.allowSystemSleep = true;
    } else if (arg === '--preActiveSeconds' || arg.startsWith('--preActiveSeconds=')) {
      args.preActiveSeconds = parseInt(arg.includes('=') ? arg.split('=')[1] : argv[++i], 10) || 60;
    } else if (arg === '--closedSeconds' || arg.startsWith('--closedSeconds=')) {
      args.closedSeconds = parseInt(arg.includes('=') ? arg.split('=')[1] : argv[++i], 10) || 120;
    } else if (arg === '--postRestartSeconds' || arg.startsWith('--postRestartSeconds=')) {
      args.postRestartSeconds = parseInt(arg.includes('=') ? arg.split('=')[1] : argv[++i], 10) || 30;
    } else if (arg === '--sleepSeconds' || arg.startsWith('--sleepSeconds=')) {
      args.sleepSeconds = parseInt(arg.includes('=') ? arg.split('=')[1] : argv[++i], 10) || 180;
    } else if (arg === '--postWakeSeconds' || arg.startsWith('--postWakeSeconds=')) {
      args.postWakeSeconds = parseInt(arg.includes('=') ? arg.split('=')[1] : argv[++i], 10) || 30;
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
  --scenario=<name>          选择测试场景 (默认: dry-run)
                             可用: dry-run, chrome-restart
                             占位: sleep-wake, network-offline
  --output-dir=<path>        报告输出目录 (默认: tests/system/sleep-wake-gate/reports)
  --user-data-dir=<path>     Chrome 用户数据目录 (复用绑定状态)
  --reset                    测试前重置 calibration 数据（若指定 --user-data-dir 会一并清理该目录）
  --verbose                  打印详细日志

  chrome-restart 专用:
  --preActiveSeconds=<n>     关闭前运行秒数 (默认: 60)
  --closedSeconds=<n>        Chrome 关闭期间秒数 (默认: 120)
  --postRestartSeconds=<n>   重开后运行秒数 (默认: 30)

  sleep-wake 专用（发布验收测试，正式发布前手动执行）:
  --preActiveSeconds=<n>     睡眠前运行秒数 (默认: 30)
  --sleepSeconds=<n>         指导睡眠秒数 (默认: 120)，仅用于打印指导，不用于定时器
  --postWakeSeconds=<n>      唤醒后运行秒数 (默认: 30)
  --allowSystemSleep         【必须】允许执行 Windows OS 睡眠/唤醒

示例:
  node runner.js --scenario=dry-run
  node runner.js --scenario=chrome-restart --preActiveSeconds=10 --closedSeconds=10 --postRestartSeconds=10 --verbose
  node runner.js --scenario=sleep-wake --user-data-dir=... --sleepSeconds=180 --allowSystemSleep --verbose
  node runner.js --scenario=dry-run --reset --verbose
`);
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`[runner] 场景: ${args.scenario}`);
  console.log(`[runner] 输出目录: ${args.outputDir}`);
  if (args.userDataDir) console.log(`[runner] Chrome 数据目录: ${args.userDataDir}`);
  if (args.reset) console.log('[runner] 重置 calibration: 是');
  if (args.verbose) console.log('[runner] 详细模式: 是');
  if (args.scenario === 'chrome-restart') {
    console.log(`[runner] 关闭前运行: ${args.preActiveSeconds} 秒`);
    console.log(`[runner] Chrome 关闭期间: ${args.closedSeconds} 秒`);
    console.log(`[runner] 重开后运行: ${args.postRestartSeconds} 秒`);
  } else if (args.scenario === 'sleep-wake') {
    console.log(`[runner] 睡眠前运行: ${args.preActiveSeconds} 秒`);
    console.log(`[runner] OS 睡眠: ${args.sleepSeconds} 秒`);
    console.log(`[runner] 唤醒后运行: ${args.postWakeSeconds} 秒`);
    if (args.allowSystemSleep) console.log('[runner] 允许系统睡眠: 是');
  }
  console.log('');

  let result;
  const startTime = Date.now();

  if (args.scenario === 'dry-run') {
    const { runDryRun } = require('./scenarios/dry-run');
    result = await runDryRun({
      reset: args.reset,
      verbose: args.verbose,
      outputDir: args.outputDir,
      userDataDir: args.userDataDir,
    });
  } else if (args.scenario === 'chrome-restart') {
    const { runChromeRestart } = require('./scenarios/chrome-restart');
    result = await runChromeRestart({
      preActiveSeconds: args.preActiveSeconds,
      closedSeconds: args.closedSeconds,
      postRestartSeconds: args.postRestartSeconds,
      reset: args.reset,
      verbose: args.verbose,
      outputDir: args.outputDir,
      userDataDir: args.userDataDir,
    });
  } else if (args.scenario === 'sleep-wake') {
    const { runSleepWake } = require('./scenarios/sleep-wake');
    result = await runSleepWake({
      preActiveSeconds: args.preActiveSeconds,
      sleepSeconds: args.sleepSeconds,
      postWakeSeconds: args.postWakeSeconds,
      reset: args.reset,
      verbose: args.verbose,
      outputDir: args.outputDir,
      userDataDir: args.userDataDir,
      allowSystemSleep: args.allowSystemSleep,
    });
  } else {
    console.error(`[runner] 错误: 场景 '${args.scenario}' 不可用。`);
    console.error('[runner] 可用场景: dry-run, chrome-restart, sleep-wake');
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`[runner] 执行耗时: ${elapsed} 秒`);

  if (result.skipped) {
    console.log(`[runner] 结果: SKIP`);
    console.log(`[runner] JSON 报告: ${result.jsonPath}`);
    console.log(`[runner] Markdown 报告: ${result.mdPath}`);
    process.exit(0);
  } else if (result.success) {
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
