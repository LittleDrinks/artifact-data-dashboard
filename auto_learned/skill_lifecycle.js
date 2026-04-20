/**
 * skill_lifecycle.js — 技能生命周期治理 V1.0
 * 
 * 每周 cron 执行一次，负责草稿晋升/降级/归档/淘汰
 * node auto_learned/skill_lifecycle.js
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const DIRS = {
  drafts: path.join(BASE, 'drafts'),
  active: path.join(BASE, 'active'),
  archive: path.join(BASE, 'archive'),
};
const ACTIVE_LIMIT = 20;
const DAY = 86400000;

function ensureDirs() {
  Object.values(DIRS).forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}

function parseMeta(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const meta = {};
  m[1].split('\n').forEach(line => {
    const [k, ...v] = line.split(':');
    if (k && v.length) meta[k.trim()] = v.join(':').trim();
  });
  meta._content = content;
  meta._path = filepath;
  meta._filename = path.basename(filepath);
  meta.use_count = parseInt(meta.use_count || '0', 10);
  meta.created_at_ms = new Date(meta.created_at || 0).getTime();
  meta.last_used_ms = new Date(meta.last_used || 0).getTime();
  return meta;
}

function moveFile(src, destDir) {
  const dest = path.join(destDir, path.basename(src));
  fs.renameSync(src, dest);
  return dest;
}

function scan(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => parseMeta(path.join(dir, f))).filter(Boolean);
}

function run() {
  const now = Date.now();
  ensureDirs();
  const report = { promoted: [], demoted: [], archived: [], deleted: [] };

  // 1. 草稿区巡检
  const drafts = scan(DIRS.drafts);
  for (const d of drafts) {
    if (d.use_count >= 3) {
      // 晋升
      const activeCount = scan(DIRS.active).length;
      if (activeCount >= ACTIVE_LIMIT) {
        // active 满了，淘汰最旧的
        const oldest = scan(DIRS.active).sort((a, b) => a.last_used_ms - b.last_used_ms)[0];
        if (oldest) {
          moveFile(oldest._path, DIRS.drafts);
          report.demoted.push(oldest._filename);
        }
      }
      moveFile(d._path, DIRS.active);
      report.promoted.push(d._filename);
    } else if ((now - d.created_at_ms) > 14 * DAY && d.use_count === 0) {
      moveFile(d._path, DIRS.archive);
      report.archived.push(d._filename);
    }
  }

  // 2. 正式区巡检
  const actives = scan(DIRS.active);
  for (const a of actives) {
    if ((now - a.last_used_ms) > 30 * DAY) {
      moveFile(a._path, DIRS.drafts);
      report.demoted.push(a._filename);
    }
  }

  // 3. 归档区清理
  const archives = scan(DIRS.archive);
  for (const ar of archives) {
    if ((now - ar.created_at_ms) > 60 * DAY) {
      // 用 trash 更安全，但 cron 环境可能没有，先移到 .trash
      const trashDir = path.join(BASE, '.trash');
      if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
      moveFile(ar._path, trashDir);
      report.deleted.push(ar._filename);
    }
  }

  console.log('[SkillLifecycle] 巡检完成:');
  console.log(`  晋升: ${report.promoted.length} | 降级: ${report.demoted.length} | 归档: ${report.archived.length} | 淘汰: ${report.deleted.length}`);
  if (report.promoted.length) console.log('  ✅ 晋升:', report.promoted.join(', '));
  if (report.demoted.length) console.log('  ⬇️ 降级:', report.demoted.join(', '));
  if (report.archived.length) console.log('  📦 归档:', report.archived.join(', '));
  if (report.deleted.length) console.log('  🗑️ 淘汰:', report.deleted.join(', '));
  return report;
}

if (require.main === module) run();
module.exports = { run };
