import axios from 'axios';

const API_URL = '/api/debug';

export const exportTableToExcel = async (table) => {
  return axios.get(`${API_URL}/export`, {
    params: { table },
    responseType: 'blob'
  });
};

export const importTableFromExcel = async (table, file) => {
  const formData = new FormData();
  formData.append('table', table);
  formData.append('file', file);

  return axios.post(`${API_URL}/import`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};
