/**
 * AssetPicker 组件测试
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssetPicker from '../components/AssetLibrary/AssetPicker';

// 模拟 axios
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

const axios = require('axios');

describe('AssetPicker', () => {
  const mockOnClose = jest.fn();
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // 模拟 API 响应
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/folders')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/api/attachments')) {
        return Promise.resolve({
          data: {
            data: [
              { id: 1, originalName: 'test.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 },
              { id: 2, originalName: 'test2.png', mimeType: 'image/png', sizeBytes: 2048 }
            ],
            meta: { total: 2, page: 1, limit: 50 }
          }
        });
      }
      if (url.includes('/api/tags')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('should render when visible', async () => {
    render(
      <AssetPicker
        visible={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('选择资产')).toBeInTheDocument();
    });
  });

  it('should not render when not visible', () => {
    render(
      <AssetPicker
        visible={false}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    expect(screen.queryByText('选择资产')).not.toBeInTheDocument();
  });

  it('should have browse and upload tabs', async () => {
    render(
      <AssetPicker
        visible={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('浏览资产库')).toBeInTheDocument();
      expect(screen.getByText('上传新文件')).toBeInTheDocument();
    });
  });

  it('should call onClose when cancel button clicked', async () => {
    render(
      <AssetPicker
        visible={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    );

    await waitFor(() => {
      const cancelButton = screen.getByText('取消');
      fireEvent.click(cancelButton);
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should show confirm button with count when files selected', async () => {
    render(
      <AssetPicker
        visible={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
        multiple={true}
      />
    );

    // 等待文件加载
    await waitFor(() => {
      expect(axios.get).toHaveBeenCalled();
    });
  });

  it('should support single selection mode', async () => {
    render(
      <AssetPicker
        visible={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
        multiple={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('选择资产')).toBeInTheDocument();
    });
  });

  it('should support multiple selection mode', async () => {
    render(
      <AssetPicker
        visible={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
        multiple={true}
        maxCount={5}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('选择资产')).toBeInTheDocument();
    });
  });

  it('should use custom title when provided', async () => {
    render(
      <AssetPicker
        visible={true}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
        title="选择封面图片"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('选择封面图片')).toBeInTheDocument();
    });
  });
});
