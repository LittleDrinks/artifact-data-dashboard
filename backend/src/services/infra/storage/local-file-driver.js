const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const DEFAULT_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const resolveWithin = (baseDir, relativePath) => {
  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, relativePath);
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error('非法路径：越界访问');
  }
  return resolved;
};

const parseWhitelist = (raw) => {
  const text = String(raw || '').trim();
  if (!text) {
    return [];
  }
  return text
    .split(/[,;\n\r]+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => path.resolve(p));
};

class LocalFileDriver {
  constructor({ uploadDir = DEFAULT_UPLOAD_DIR, importWhitelist = null } = {}) {
    this.uploadDir = path.resolve(uploadDir);
    this.resolvedUploadDir = this.uploadDir;
    this.importWhitelist = Array.isArray(importWhitelist)
      ? importWhitelist.map(p => path.resolve(p))
      : parseWhitelist(process.env.ATTACHMENT_IMPORT_DIR_WHITELIST);
  }

  async ensureUploadDir() {
    await fsp.mkdir(this.uploadDir, { recursive: true });
    await fsp.mkdir(path.join(this.uploadDir, 'thumbnails'), { recursive: true });
    await fsp.mkdir(path.join(this.uploadDir, 'tmp'), { recursive: true });
  }

  resolveUploadPath(storageName) {
    return resolveWithin(this.uploadDir, storageName);
  }

  async writeBuffer(storageName, buffer) {
    await this.ensureUploadDir();
    const filePath = this.resolveUploadPath(storageName);
    await fsp.writeFile(filePath, buffer);
    return filePath;
  }

  async copyFromLocalFile(srcPath, destStorageName) {
    await this.ensureUploadDir();
    const destPath = this.resolveUploadPath(destStorageName);
    await fsp.copyFile(srcPath, destPath);
    return destPath;
  }

  async delete(storageName) {
    const filePath = this.resolveUploadPath(storageName);
    if (fs.existsSync(filePath)) {
      await fsp.unlink(filePath);
    }
  }

  async exists(storageName) {
    const filePath = this.resolveUploadPath(storageName);
    return fs.existsSync(filePath);
  }

  assertImportDirAllowed(dirPath) {
    const resolved = path.resolve(String(dirPath || ''));
    if (!resolved) {
      throw new Error('dir 不能为空');
    }

    if (!this.importWhitelist.length) {
      throw new Error('未配置导入目录白名单（ATTACHMENT_IMPORT_DIR_WHITELIST）');
    }

    const ok = this.importWhitelist.some(base => {
      return resolved === base || resolved.startsWith(base + path.sep);
    });

    if (!ok) {
      throw new Error('导入目录不在白名单范围内');
    }

    return resolved;
  }

  async listFilesRecursive(dirPath) {
    const resolved = path.resolve(dirPath);
    const out = [];

    const walk = async (current) => {
      const entries = await fsp.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          out.push(full);
        }
      }
    };

    await walk(resolved);
    return out;
  }
}

module.exports = {
  LocalFileDriver
};
