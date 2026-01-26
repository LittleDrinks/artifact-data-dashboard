/**
 * FolderTree - 文件夹树组件
 * 使用 antd Tree 组件实现虚拟文件夹层级显示
 */
import React, { useState, useCallback } from 'react';
import { Tree, Dropdown, Input, Modal, message } from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DragOutlined
} from '@ant-design/icons';

const FolderTree = ({
  folders = [],
  selectedFolderId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  loading = false
}) => {
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createParentId, setCreateParentId] = useState(null);

  // 将扁平文件夹列表转换为树形数据
  const buildTreeData = useCallback((items) => {
    const map = new Map();
    const roots = [];

    items.forEach(item => {
      map.set(item.id, {
        key: String(item.id),
        title: item.name,
        icon: ({ expanded }) => expanded ? <FolderOpenOutlined /> : <FolderOutlined />,
        children: [],
        data: item
      });
    });

    items.forEach(item => {
      const node = map.get(item.id);
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, []);

  const treeData = buildTreeData(folders);

  // 右键菜单项
  const getContextMenuItems = (node) => [
    {
      key: 'create',
      icon: <PlusOutlined />,
      label: '新建子文件夹',
      onClick: () => {
        setCreateParentId(node ? parseInt(node.key, 10) : null);
        setNewFolderName('');
        setCreateModalVisible(true);
      }
    },
    ...(node ? [
      {
        key: 'rename',
        icon: <EditOutlined />,
        label: '重命名',
        onClick: () => {
          setEditingKey(node.key);
          setEditingName(node.title);
        }
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: '确认删除',
            content: `确定要删除文件夹 "${node.title}" 吗？文件夹内的文件将移至根目录。`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => onDeleteFolder?.(parseInt(node.key, 10))
          });
        }
      }
    ] : [])
  ];

  // 处理选择
  const handleSelect = (selectedKeys) => {
    if (selectedKeys.length > 0) {
      const folderId = parseInt(selectedKeys[0], 10);
      onSelect?.(folderId);
    }
  };

  // 处理展开
  const handleExpand = (keys) => {
    setExpandedKeys(keys);
  };

  // 处理重命名确认
  const handleRenameConfirm = async () => {
    if (!editingName.trim()) {
      message.error('文件夹名称不能为空');
      return;
    }
    
    try {
      await onRenameFolder?.(parseInt(editingKey, 10), editingName.trim());
      setEditingKey(null);
      setEditingName('');
    } catch (err) {
      message.error(err.message || '重命名失败');
    }
  };

  // 处理创建确认
  const handleCreateConfirm = async () => {
    if (!newFolderName.trim()) {
      message.error('文件夹名称不能为空');
      return;
    }

    try {
      await onCreateFolder?.(newFolderName.trim(), createParentId);
      setCreateModalVisible(false);
      setNewFolderName('');
      setCreateParentId(null);
    } catch (err) {
      message.error(err.message || '创建失败');
    }
  };

  // 处理拖拽
  const handleDrop = (info) => {
    const dragKey = info.dragNode.key;
    const dropKey = info.node.key;
    const dropPos = info.node.pos.split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    // 如果放置在节点上，移动到该节点内
    // 如果放置在节点之间，移动到父节点
    let newParentId = null;
    if (info.dropToGap) {
      // 放置在间隙，获取目标节点的父节点
      const targetNode = folders.find(f => String(f.id) === dropKey);
      newParentId = targetNode?.parentId || null;
    } else {
      // 放置在节点上
      newParentId = parseInt(dropKey, 10);
    }

    onMoveFolder?.(parseInt(dragKey, 10), newParentId);
  };

  // 自定义标题渲染（支持编辑状态）
  const titleRender = (nodeData) => {
    if (editingKey === nodeData.key) {
      return (
        <Input
          size="small"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onPressEnter={handleRenameConfirm}
          onBlur={handleRenameConfirm}
          autoFocus
          style={{ width: 120 }}
        />
      );
    }
    
    return (
      <Dropdown
        menu={{ items: getContextMenuItems(nodeData) }}
        trigger={['contextMenu']}
      >
        <span className="folder-tree-title">
          {nodeData.title}
        </span>
      </Dropdown>
    );
  };

  return (
    <div className="folder-tree">
      {/* 根目录操作按钮 */}
      <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
        <Dropdown
          menu={{ items: getContextMenuItems(null) }}
          trigger={['contextMenu']}
        >
          <a
            onClick={() => onSelect?.(null)}
            style={{ 
              display: 'block',
              padding: '4px 8px',
              color: selectedFolderId === null ? '#1890ff' : 'inherit',
              fontWeight: selectedFolderId === null ? 'bold' : 'normal'
            }}
          >
            <FolderOutlined style={{ marginRight: 8 }} />
            全部文件
          </a>
        </Dropdown>
      </div>

      <Tree
        showIcon
        draggable
        blockNode
        treeData={treeData}
        selectedKeys={selectedFolderId ? [String(selectedFolderId)] : []}
        expandedKeys={expandedKeys}
        onSelect={handleSelect}
        onExpand={handleExpand}
        onDrop={handleDrop}
        titleRender={titleRender}
        loading={loading}
      />

      {/* 创建文件夹对话框 */}
      <Modal
        title="新建文件夹"
        open={createModalVisible}
        onOk={handleCreateConfirm}
        onCancel={() => setCreateModalVisible(false)}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="请输入文件夹名称"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateConfirm}
          autoFocus
        />
      </Modal>

      <style>{`
        .folder-tree .ant-tree-node-content-wrapper {
          display: flex;
          align-items: center;
        }
        .folder-tree .folder-tree-title {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
};

export default FolderTree;
