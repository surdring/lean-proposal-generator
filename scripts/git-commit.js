#!/usr/bin/env node
/**
 * 通用 Git 提交助手（提交后自动推送）
 *
 * 运行方式:
 *   1. npm run commit                    # 自动生成提交信息 + push
 *   2. npm run commit -- "feat: xxx"     # 自定义提交信息 + push
 *   3. node scripts/git-commit.js          # 直接运行
 *   4. node scripts/git-commit.js "feat: xxx"  # 带自定义信息
 *
 * 不带参数时会根据变更文件自动生成提交信息
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve, extname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ANSI = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', cwd: resolve(__dirname, '..'), ...opts }).trim();
}

function color(c, text) {
  return `${ANSI[c]}${text}${ANSI.reset}`;
}

function getChangedFiles() {
  const status = run('git status --short');
  if (!status) return [];
  return status.split('\n').map(line => {
    const statusCode = line.substring(0, 2).trim();
    const file = line.substring(3).trim();
    return { status: statusCode, file };
  });
}

function generateMessage(files) {
  const groups = {};
  for (const { file } of files) {
    const dir = file.split('/')[0] || 'root';
    const ext = extname(file).replace('.', '') || 'file';
    const key = `${dir}(${ext})`;
    groups[key] = (groups[key] || 0) + 1;
  }
  const parts = Object.entries(groups).map(([k, n]) => `${n} ${k}`);
  return `update: ${parts.join(', ')}`;
}

function main() {
  console.log(color('bright', '\n  Git Commit Helper\n'));

  // Check if in a git repo
  try {
    run('git rev-parse --git-dir');
  } catch {
    console.log(color('red', '  错误: 当前目录不是 Git 仓库\n'));
    process.exit(1);
  }

  const branch = run('git branch --show-current');
  console.log(`  当前分支: ${color('cyan', branch)}\n`);

  const files = getChangedFiles();
  if (files.length === 0) {
    console.log(color('yellow', '  没有变更的文件，无需提交\n'));
    process.exit(0);
  }

  console.log(color('bright', '  变更文件:'));
  for (const { status, file } of files) {
    const colorName = status === 'M' ? 'yellow' : status === 'A' ? 'green' : status === 'D' ? 'red' : 'gray';
    console.log(`    ${color(colorName, status.padStart(2))}  ${file}`);
  }
  console.log();

  // Stage all changes
  const stagedBefore = run('git diff --cached --name-only');
  const hasUntracked = files.some(f => f.status === '??');
  if (hasUntracked) {
    console.log(color('gray', '  自动添加新文件...'));
  }
  run('git add -A');
  console.log(color('green', '  已添加到暂存区\n'));

  // Commit message
  let message = process.argv[2];
  if (!message) {
    message = generateMessage(files);
    console.log(color('gray', `  自动生成提交信息: "${message}"`));
    console.log(color('gray', '  提示: 可传入参数自定义，如 npm run commit "feat: 新增功能"\n'));
  }

  try {
    run(`git commit -m "${message}"`);
    const hash = run('git rev-parse --short HEAD');
    console.log(color('green', `  提交成功: ${hash}`));
    try {
      run(`git push origin ${branch}`);
      console.log(color('green', `  推送成功: origin/${branch}\n`));
    } catch (err) {
      console.log(color('yellow', `  推送失败: ${err.message}\n`));
    }
  } catch (err) {
    console.log(color('red', `  提交失败: ${err.message}\n`));
    process.exit(1);
  }
}

main();
