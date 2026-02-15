const XLSX = require('xlsx');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { getStorageDriver } = require('./storage');

/**
 * Export attachments metadata to an XLSX buffer.
 * @param {Array<Object>} rows - Array of attachment metadata objects
 * @returns {Buffer}
 */
const exportAttachmentsXlsxBuffer = (rows = []) => {
  const headers = ['fileName', 'filePath', 'fileSize', 'mimeType', 'uploadDate', 'uploadedBy', 'tags', 'referenceCount'];
  const worksheet = XLSX.utils.json_to_sheet(rows.map(r => ({
    fileName: r.originalName || '',
    filePath: r.storagePath || '',
    fileSize: r.sizeBytes || 0,
    mimeType: r.mimeType || '',
    uploadDate: r.uploadDate || '',
    uploadedBy: r.uploadedBy || '',
    tags: Array.isArray(r.tags) ? r.tags.join(';') : (r.tags || ''),
    referenceCount: typeof r.referenceCount === 'number' ? r.referenceCount : (r.referenceCount || 0)
  }), { header: headers }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'attachments');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return buffer;
};

/**
 * Create an archiver instance that streams selected attachment files.
 * Caller should pipe the returned archive to the response, e.g. `archive.pipe(res)`.
 * @param {Array<{storageName:string,entryName:string}>} files - list of files to include
 * @param {Object} [options]
 * @returns {archiver.Archiver}
 */
const createZipArchive = (files = [], options = {}) => {
  const archive = archiver('zip', { zlib: { level: 9 } });

  // Append files (storageName is path inside storage driver)
  const storage = getStorageDriver();

  for (const f of files) {
    try {
      const resolved = storage.resolveUploadPath(f.storageName);
      if (fs.existsSync(resolved)) {
        archive.file(resolved, { name: f.entryName });
      }
    } catch (err) {
      // skip missing files
    }
  }

  // finalize is caller's responsibility after piping
  return archive;
};

module.exports = {
  exportAttachmentsXlsxBuffer,
  createZipArchive
};
