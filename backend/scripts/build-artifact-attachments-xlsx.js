#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const XLSX = require('xlsx');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg']);

const parseArgs = (argv) => {
  const args = {
    imagesDir: '/data/import/crawler/shenzhen/images_shenzhen',
    output: '/app/scripts/artifact_attachments.xlsx'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--images-dir' && argv[i + 1]) {
      args.imagesDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
};

const isNumericFolderName = (name) => /^\d+$/.test(String(name));

const walk = async (dir) => {
  const out = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
};

const main = async () => {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log('Usage: node scripts/build-artifact-attachments-xlsx.js [--images-dir /data/import/crawler/shenzhen/images_shenzhen] [--output /app/scripts/artifact_attachments.xlsx]');
    process.exit(0);
  }

  const imagesDir = path.resolve(args.imagesDir);
  const outputPath = path.resolve(args.output);

  if (!fs.existsSync(imagesDir)) {
    throw new Error(`images-dir not found: ${imagesDir}`);
  }

  const allFiles = await walk(imagesDir);
  const rows = [];

  for (const fp of allFiles) {
    const ext = path.extname(fp).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) {
      continue;
    }

    const rel = path.relative(imagesDir, fp).split(path.sep).join('/');
    const parts = rel.split('/');
    if (parts.length < 2) {
      continue;
    }

    const artifactId = parts[0];
    if (!isNumericFolderName(artifactId)) {
      continue;
    }

    rows.push({
      artifact_id: artifactId,
      file_reference: rel,
      original_name: path.basename(fp)
    });
  }

  rows.sort((a, b) => {
    const aa = `${a.artifact_id}/${a.file_reference}`.toLowerCase();
    const bb = `${b.artifact_id}/${b.file_reference}`.toLowerCase();
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return 0;
  });

  if (rows.length === 0) {
    throw new Error(`No images found under: ${imagesDir}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: ['artifact_id', 'file_reference', 'original_name'] });
  XLSX.utils.book_append_sheet(wb, ws, 'ArtifactAttachments');
  XLSX.writeFile(wb, outputPath);

  const artifactCount = new Set(rows.map(r => String(r.artifact_id))).size;
  console.log(`OK: artifacts=${artifactCount} images=${rows.length} -> ${outputPath}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
