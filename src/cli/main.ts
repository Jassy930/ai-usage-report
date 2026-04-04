/**
 * CLI 入口 — 解析参数，分发子命令，输出结果
 */

import { resolve, relative } from "node:path";
import { parseArgs } from "./args";
import { reportCommand } from "./commands/report";
import { sessionsCommand } from "./commands/sessions";
import { projectsCommand } from "./commands/projects";

const HELP_TEXT = `usage: ai-usage-report <command> [tool] [options]

Commands:
  report     生成完整使用报告
  sessions   列出会话记录
  projects   按项目汇总

Tool:
  codex | claude-code | all (默认 all)

Options:
  --format <terminal|json|md>   输出格式 (默认 terminal)
  --since <7d|30d|1m|1y>        时间范围过滤
  --limit <n>                   限制输出条数 (sessions)
  --project <keyword>           项目关键字过滤
  --model <keyword>             模型名称过滤
  --out <file>                  输出到文件
  --codex-dir <path>            Codex 数据目录
  --claude-dir <path>           Claude Code 数据目录
  -h, --help                    显示帮助
`;

export interface CliResult {
  exitCode: number;
  output: string;
}

/**
 * 运行 CLI，返回退出码和输出字符串（方便测试）
 */
export async function runCli(argv: string[]): Promise<CliResult> {
  const args = parseArgs(argv);

  if (args.help || (args.command === null && !args.unknownCommand)) {
    return { exitCode: 0, output: HELP_TEXT };
  }

  if (args.unknownCommand) {
    return { exitCode: 1, output: `未知命令: ${args.unknownCommand}\n\n${HELP_TEXT}` };
  }

  let output = "";

  try {
    switch (args.command) {
      case "report":
        output = await reportCommand(args);
        break;
      case "sessions":
        output = await sessionsCommand(args);
        break;
      case "projects":
        output = await projectsCommand(args);
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, output: `错误: ${msg}` };
  }

  // 输出到文件或返回
  if (args.out) {
    const absPath = resolve(args.out);
    const rel = relative(process.cwd(), absPath);
    if (rel.startsWith("..") || resolve(rel) !== absPath) {
      return { exitCode: 1, output: `错误: 输出路径不允许指向工作目录之外: ${args.out}` };
    }
    await Bun.write(absPath, output);
    return { exitCode: 0, output: `已写入: ${args.out}` };
  }

  return { exitCode: 0, output };
}

// 直接执行时作为 CLI 入口
if (import.meta.main) {
  const argv = process.argv.slice(2);
  runCli(argv).then((result) => {
    if (result.output) {
      process.stdout.write(result.output + "\n");
    }
    process.exit(result.exitCode);
  });
}
