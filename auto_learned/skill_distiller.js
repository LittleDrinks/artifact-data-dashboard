/**
 * skill_distiller.js — 自动技能沉淀蒸馏器 V1.0
 * 
 * 用法：在复杂任务收尾时由主大脑调用
 * node -e "require('./auto_learned/skill_distiller.js').distill({name, scenario, steps, pitfalls, boundary})"
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRAFTS_DIR = path.join(__dirname, 'drafts');
const DRAFTS_LIMIT = 50;

function distill({ name, scenario, steps, pitfalls, boundary }) {
  if (!name || !scenario || !steps) {
    console.log('[SkillDistiller] 缺少必填字段(name/scenario/steps)，跳过沉淀');
    return null;
  }

  // 确保目录存在
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  // 检查容量上限
  const existing = fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md'));
  if (existing.length >= DRAFTS_LIMIT) {
    // 按修改时间排序，淘汰最旧的
    const sorted = existing.map(f => {
      const fp = path.join(DRAFTS_DIR, f);
      return { f, mtime: fs.statSync(fp).mtimeMs };
    }).sort((a, b) => a.mtime - b.mtime);
    const victim = path.join(DRAFTS_DIR, sorted[0].f);
    console.log(`[SkillDistiller] 草稿区已满(${DRAFTS_LIMIT})，淘汰最旧: ${sorted[0].f}`);
    const trashDir = path.join(__dirname, '.trash');
    if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
    fs.renameSync(victim, path.join(trashDir, sorted[0].f));
  }

  const id = crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const filename = `${name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, '_')}_${id}.md`;

  const content = `---
id: ${id}
name: ${name}
status: draft
created_at: ${now}
last_used: ${now}
use_count: 0
---

# ${name}

## 触发场景
${scenario}

## 执行步骤
${Array.isArray(steps) ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : steps}

## 踩坑记录
${pitfalls || '（暂无）'}

## 适用边界
${boundary || '（待补充）'}
`;

  const fp = path.join(DRAFTS_DIR, filename);
  fs.writeFileSync(fp, content, 'utf-8');
  console.log(`[SkillDistiller] ✅ 技能草稿已沉淀: ${filename}`);
  return { id, filename, path: fp };
}

module.exports = { distill };
