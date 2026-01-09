import axios from 'axios';

const BASE = '/api/attachments';

// Ensure baseURL is configured even if auth.service hasn't run yet.
const rawBaseURL = (process.env.REACT_APP_API_URL ?? '').trim();
const normalizedBaseURL = rawBaseURL.replace(/\/+$/, '').replace(/\/api\/?$/, '');
if (normalizedBaseURL && axios.defaults.baseURL !== normalizedBaseURL) {
  axios.defaults.baseURL = normalizedBaseURL;
}

export const uploadAttachment = async ({ file, ownerType, ownerId, signal, onUploadProgress } = {}) => {
  const form = new FormData();
  form.append('file', file);
  if (ownerType !== undefined && ownerType !== null && String(ownerType).trim() !== '') {
    form.append('ownerType', ownerType);
  }
  if (ownerId !== undefined && ownerId !== null && String(ownerId).trim() !== '') {
    form.append('ownerId', ownerId);
  }
  return axios.post(`${BASE}/upload`, form, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    signal,
    onUploadProgress
  });
};

export const listAttachments = async ({ ownerType, ownerId, page, limit } = {}) => {
  const params = {};
  if (ownerType !== undefined && ownerType !== null && String(ownerType).trim() !== '') {
    params.ownerType = ownerType;
  }
  if (ownerId !== undefined && ownerId !== null && String(ownerId).trim() !== '') {
    params.ownerId = ownerId;
  }
  if (page !== undefined && page !== null && String(page).trim() !== '') {
    params.page = page;
  }
  if (limit !== undefined && limit !== null && String(limit).trim() !== '') {
    params.limit = limit;
  }
  return axios.get(BASE, { params });
};

export const getAttachment = async (id) => {
  return axios.get(`${BASE}/${id}`);
};

export const deleteAttachment = async (id) => {
  return axios.delete(`${BASE}/${id}`);
};

export const getAttachmentDownloadUrl = (id) => {
  return `${BASE}/${id}/download`;
};

export const exportKnowledgeGraphExcel = async () => {
  return axios.post(`${BASE}/excel/export`);
};

export const importKnowledgeGraphExcelFromAttachment = async ({ id, strategy } = {}) => {
  const attachmentId = id;
  const params = {};
  if (strategy !== undefined && strategy !== null && String(strategy).trim() !== '') {
    params.strategy = strategy;
  }
  return axios.post(`${BASE}/${attachmentId}/excel/import`, null, { params });
};

export const importArtifactAttachmentLinksExcel = async ({ file, onUploadProgress, signal } = {}) => {
  const form = new FormData();
  form.append('file', file);
  return axios.post(`${BASE}/excel/link-import`, form, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress,
    signal
  });
};

export const importAttachmentsFromDir = async ({ dir, ownerType, ownerId, maxFiles } = {}) => {
  const payload = {
    dir: String(dir || '').trim()
  };
  if (ownerType !== undefined && ownerType !== null && String(ownerType).trim() !== '') {
    payload.ownerType = String(ownerType).trim();
  }
  if (ownerId !== undefined && ownerId !== null && String(ownerId).trim() !== '') {
    payload.ownerId = Number(ownerId);
  }
  if (maxFiles !== undefined && maxFiles !== null && String(maxFiles).trim() !== '') {
    payload.maxFiles = Number(maxFiles);
  }
  return axios.post(`${BASE}/import-dir`, payload);
};
