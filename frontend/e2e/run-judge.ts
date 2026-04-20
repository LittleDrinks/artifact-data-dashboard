import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'e2e', 'screenshots');
const REPORTS_DIR = path.join(process.cwd(), 'e2e', 'reports');
const JUDGE_PROMPT_PATH = path.join(process.cwd(), 'e2e', 'judge-prompt.md');

// Kimi Vision API 配置（兼容 OpenAI SDK）
const KIMI_API_KEY = process.env.KIMI_API_KEY || '';
const KIMI_API_BASE = process.env.KIMI_API_BASE || 'https://api.moonshot.cn/v1';
const KIMI_MODEL = 'moonshot-v1-8k'; // 支持 vision 的模型

interface JudgeResult {
  page: string;
  screenshot_file: string;
  dimensions: {
    layout: { score: number; pass: boolean; issues: string[] };
    data_integrity: { score: number; pass: boolean; issues: string[] };
    interaction: { score: number; pass: boolean; issues: string[] };
    error_handling: { score: number; pass: boolean; issues: string[] };
  };
  overall_pass: boolean;
  critical_issues: string[];
  suggestions: string[];
}

/**
 * 将图片文件转为 base64
 */
function imageToBase64(imagePath: string): string {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * 获取图片 MIME 类型
 */
function getMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

/**
 * 调用 Kimi Vision API 进行评审
 */
async function judgeScreenshot(
  client: OpenAI,
  imagePath: string,
  judgePrompt: string
): Promise<JudgeResult> {
  const base64Image = imageToBase64(imagePath);
  const mimeType = getMimeType(imagePath);
  const filename = path.basename(imagePath);

  console.log(`Judging: ${filename}`);

  try {
    const response = await client.chat.completions.create({
      model: KIMI_MODEL,
      messages: [
        {
          role: 'system',
          content: judgePrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `请评审这张截图：${filename}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1, // 低温度保证一致性
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '';
    // 解析 JSON 响应
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`无法从响应中解析 JSON: ${content}`);
    }

    const result: JudgeResult = JSON.parse(jsonMatch[0]);
    result.screenshot_file = filename;
    return result;
  } catch (error) {
    console.error(`Error judging ${filename}:`, error);
    // 返回失败结果
    return {
      page: 'Unknown',
      screenshot_file: filename,
      dimensions: {
        layout: { score: 0, pass: false, issues: ['评审失败'] },
        data_integrity: { score: 0, pass: false, issues: ['评审失败'] },
        interaction: { score: 0, pass: false, issues: ['评审失败'] },
        error_handling: { score: 0, pass: false, issues: ['评审失败'] },
      },
      overall_pass: false,
      critical_issues: ['评审 API 调用失败'],
      suggestions: ['检查 Kimi API 配置和网络连接'],
    };
  }
}

/**
 * 主函数：遍历截图并评审
 */
async function runJudge(): Promise<void> {
  // 检查环境变量
  if (!KIMI_API_KEY) {
    console.error('Error: KIMI_API_KEY environment variable is not set');
    console.error('Please set KIMI_API_KEY before running this script');
    process.exit(1);
  }

  // 确保目录存在
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // 读取 judge prompt
  if (!fs.existsSync(JUDGE_PROMPT_PATH)) {
    console.error('Error: judge-prompt.md not found');
    process.exit(1);
  }
  const judgePrompt = fs.readFileSync(JUDGE_PROMPT_PATH, 'utf-8');

  // 初始化 OpenAI client（指向 Kimi API）
  const client = new OpenAI({
    apiKey: KIMI_API_KEY,
    baseURL: KIMI_API_BASE,
  });

  // 获取所有截图
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    console.error('Error: screenshots directory not found');
    console.error('Please run E2E tests first to generate screenshots');
    process.exit(1);
  }

  const screenshotFiles = fs
    .readdirSync(SCREENSHOTS_DIR)
    .filter((file) => /\.(png|jpg|jpeg|webp)$/i.test(file))
    .sort();

  if (screenshotFiles.length === 0) {
    console.log('No screenshots found in e2e/screenshots/');
    return;
  }

  console.log(`Found ${screenshotFiles.length} screenshots to judge`);

  // 评审每张截图
  const results: JudgeResult[] = [];
  for (const file of screenshotFiles) {
    const imagePath = path.join(SCREENSHOTS_DIR, file);
    const result = await judgeScreenshot(client, imagePath, judgePrompt);
    results.push(result);

    // 打印结果摘要
    console.log(
      `  ${file}: ${result.overall_pass ? 'PASS' : 'FAIL'} (layout=${result.dimensions.layout.score}, data=${result.dimensions.data_integrity.score})`
    );
  }

  // 生成汇总报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `judge-report-${timestamp}.json`);
  const summaryPath = path.join(REPORTS_DIR, `judge-summary-${timestamp}.md`);

  // 写入完整 JSON 报告
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);

  // 生成 Markdown 汇总
  const passCount = results.filter((r) => r.overall_pass).length;
  const failCount = results.length - passCount;

  let summaryMd = `# E2E Judge Report\n\n`;
  summaryMd += `**Date**: ${new Date().toISOString()}\n`;
  summaryMd += `**Total Screenshots**: ${results.length}\n`;
  summaryMd += `**Pass**: ${passCount}\n`;
  summaryMd += `**Fail**: ${failCount}\n\n`;
  summaryMd += `## Results Summary\n\n`;
  summaryMd += `| Screenshot | Overall | Layout | Data | Interaction | Error Handling |\n`;
  summaryMd += `|------------|---------|--------|------|-------------|----------------|\n`;

  for (const r of results) {
    summaryMd += `| ${r.screenshot_file} | ${r.overall_pass ? '✅' : '❌'} | ${r.dimensions.layout.score} | ${r.dimensions.data_integrity.score} | ${r.dimensions.interaction.score} | ${r.dimensions.error_handling.score} |\n`;
  }

  // 添加 critical issues
  const criticalIssues = results
    .filter((r) => r.critical_issues.length > 0)
    .flatMap((r) => r.critical_issues.map((i) => `- [${r.screenshot_file}] ${i}`));

  if (criticalIssues.length > 0) {
    summaryMd += `\n## Critical Issues\n\n`;
    summaryMd += criticalIssues.join('\n') + '\n';
  }

  fs.writeFileSync(summaryPath, summaryMd);
  console.log(`Summary saved to: ${summaryPath}`);

  // 最终状态
  console.log(`\n=== Final Result ===`);
  if (failCount === 0) {
    console.log('✅ All screenshots passed the judge!');
  } else {
    console.log(`❌ ${failCount} screenshots failed. Check the report for details.`);
    process.exit(1); // 非 0 退出码表示有失败
  }
}

// 执行
runJudge().catch((err) => {
  console.error('Judge run failed:', err);
  process.exit(1);
});