import axios from 'axios';

const BASE = '/api/attachments';

export const uploadAttachment = async ({ file, ownerType, ownerId }) => {
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
    }
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
