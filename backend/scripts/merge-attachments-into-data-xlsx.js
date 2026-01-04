#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const XLSX = require('xlsx');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg']);

const parseArgs = (argv) => {
  const args = {
    dataXlsx: '/data/import/data.xlsx',
    imagesDir: null,
    sheet: 'ArtifactAttachments',
    inplace: true,
    backup: true
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--data-xlsx' && argv[i + 1]) {
      args.dataXlsx = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === '--images-dir' && argv[i + 1]) {
      args.imagesDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === '--sheet' && argv[i + 1]) {
      args.sheet = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === '--inplace') {
      args.inplace = true;
      continue;
    }
    if (a === '--no-inplace') {
      args.inplace = false;
      continue;
    }
    if (a === '--no-backup') {
      args.backup = false;
      continue;
    }
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
};

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

const isNumericFolderName = (name) => /^\d+$/.test(String(name));

const buildAttachmentRows = async (imagesDirAbs) => {
  const allFiles = await walk(imagesDirAbs);
  const rows = [];

  for (const fp of allFiles) {
    const ext = path.extname(fp).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) {
      continue;
    }

    const rel = path.relative(imagesDirAbs, fp).split(path.sep).join('/');
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

  return rows;
};

const timestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const main = async () => {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log('Usage: node scripts/merge-attachments-into-data-xlsx.js --images-dir <dir> [--data-xlsx <path>] [--no-inplace] [--no-backup]');
    process.exit(0);
  }

  const dataXlsxAbs = path.resolve(args.dataXlsx);
  if (!fs.existsSync(dataXlsxAbs)) {
    throw new Error(`data.xlsx not found: ${dataXlsxAbs}`);
  }

  if (!args.imagesDir) {
    throw new Error('Missing required --images-dir');
  }

  const imagesDirAbs = path.resolve(args.imagesDir);
  if (!fs.existsSync(imagesDirAbs)) {
    throw new Error(`images-dir not found: ${imagesDirAbs}`);
  }

  const rows = await buildAttachmentRows(imagesDirAbs);
  if (rows.length === 0) {
    throw new Error(`No images found under: ${imagesDirAbs}`);
  }

  const workbook = XLSX.readFile(dataXlsxAbs);

  const ws = XLSX.utils.json_to_sheet(rows, { header: ['artifact_id', 'file_reference', 'original_name'] });
  const sheetName = String(args.sheet || 'ArtifactAttachments');

  // replace if exists
  workbook.Sheets[sheetName] = ws;
  if (!workbook.SheetNames.includes(sheetName)) {
    workbook.SheetNames.push(sheetName);
  }

  if (args.inplace) {
    if (args.backup) {
      const backupPath = `${dataXlsxAbs}.bak-${timestamp()}`;
      await fsp.copyFile(dataXlsxAbs, backupPath);
      console.log(`Backup: ${backupPath}`);
    }
    XLSX.writeFile(workbook, dataXlsxAbs);
    console.log(`OK: wrote sheet '${sheetName}' rows=${rows.length} -> ${dataXlsxAbs}`);
  } else {
    const outPath = dataXlsxAbs.replace(/\.xlsx$/i, '') + '.with_attachments.xlsx';
    XLSX.writeFile(workbook, outPath);
    console.log(`OK: wrote sheet '${sheetName}' rows=${rows.length} -> ${outPath}`);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
