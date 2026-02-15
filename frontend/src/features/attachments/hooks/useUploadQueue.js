import { useState, useRef, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  uploadAttachment
} from '../../../services/attachment.service';

const MAX_CONCURRENT = 3;

const generateId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const useUploadQueue = ({ isAdmin, ownerType, ownerId, onUploadSuccess }) => {
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    uploading: 0,
    success: 0,
    error: 0
  });
  const runningCountRef = useRef(0);
  const queueRef = useRef(queue);
  const abortControllersRef = useRef({});

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const updateStats = useCallback((nextQueue) => {
    const pending = nextQueue.filter((i) => i.status === 'pending').length;
    const uploading = nextQueue.filter((i) => i.status === 'uploading').length;
    const success = nextQueue.filter((i) => i.status === 'success').length;
    const error = nextQueue.filter((i) => i.status === 'error').length;
    setStats({ pending, uploading, success, error });
  }, []);

  const processQueue = useCallback(async () => {
    if (!isAdmin) return;

    const currentQueue = queueRef.current;
    const uploadingCount = currentQueue.filter(
      (i) => i.status === 'uploading'
    ).length;
    const pendingItems = currentQueue.filter((i) => i.status === 'pending');
    const slots = Math.max(0, MAX_CONCURRENT - uploadingCount);
    if (slots <= 0 || pendingItems.length === 0) return;

    const toProcess = pendingItems.slice(0, slots);

    await Promise.all(
      toProcess.map(async (item) => {
        runningCountRef.current += 1;

        setQueue((prev) => {
          const next = prev.map((i) =>
            i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i
          );
          updateStats(next);
          return next;
        });

        const controller = new AbortController();
        abortControllersRef.current[item.id] = controller;

        const onProgress = (progress) => {
          setQueue((prev) => {
            const next = prev.map((i) =>
              i.id === item.id ? { ...i, progress } : i
            );
            return next;
          });
        };

        try {
          const name = item.file.name;
          const existsRes = await checkAttachmentExists({
            fileName: name,
            ownerType: ownerType.trim() || undefined,
            ownerId: ownerId.trim() || undefined
          });
          if (existsRes.data?.data?.exists) {
            throw new Error('该文件已存在，请勿重复上传');
          }

          await directUpload({
            file: item.file,
            ownerType: ownerType.trim() || undefined,
            ownerId: ownerId.trim() || undefined,
            signal: controller.signal,
            onProgress
          });

          setQueue((prev) => {
            const next = prev.map((i) =>
              i.id === item.id
                ? { ...i, status: 'success', progress: 100 }
                : i
            );
            updateStats(next);
            return next;
          });

          if (onUploadSuccess) onUploadSuccess();
        } catch (err) {
          if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            setQueue((prev) => {
              const next = prev.map((i) =>
                i.id === item.id ? { ...i, status: 'cancelled', progress: 0 } : i
              );
              updateStats(next);
              return next;
            });
          } else {
            const msg = err?.response?.data?.message || err.message || '上传失败';
            setQueue((prev) => {
              const next = prev.map((i) =>
                i.id === item.id ? { ...i, status: 'error', error: msg } : i
              );
              updateStats(next);
              return next;
            });
          }
        } finally {
          delete abortControllersRef.current[item.id];
          runningCountRef.current = Math.max(0, runningCountRef.current - 1);
        }
      })
    );

    processQueue();
  }, [isAdmin, ownerType, ownerId, onUploadSuccess, updateStats]);

  const addToQueue = useCallback(
    (files) => {
      if (!isAdmin) {
        message.warning('仅管理员可上传文件');
        return;
      }
      if (!files || files.length === 0) return;

      const newItems = Array.from(files).map((file) => ({
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        status: 'pending',
        progress: 0,
        error: null
      }));

      setQueue((prev) => {
        const next = [...prev, ...newItems];
        updateStats(next);
        return next;
      });

      setTimeout(() => processQueue(), 0);
    },
    [isAdmin, processQueue, updateStats]
  );

  const cancelUpload = useCallback(
    async (id) => {
      const item = queue.find((i) => i.id === id);
      if (!item) return;

      if (item.status === 'uploading') {
        const controller = abortControllersRef.current[id];
        if (controller) {
          controller.abort();
        }
      } else if (item.status === 'pending') {
        setQueue((prev) => {
          const next = prev.map((i) =>
            i.id === id ? { ...i, status: 'cancelled' } : i
          );
          updateStats(next);
          return next;
        });
      }
    },
    [queue, updateStats]
  );

  const clearCompleted = useCallback(() => {
    setQueue((prev) => {
      const next = prev.filter(
        (i) => i.status !== 'success' && i.status !== 'cancelled'
      );
      updateStats(next);
      return next;
    });
  }, [updateStats]);

  const deleteFile = useCallback(
    async (id) => {
      if (!isAdmin) return;
      try {
        await directDelete(id);
        message.success('删除成功');
        if (onUploadSuccess) onUploadSuccess();
      } catch (err) {
        message.error(err?.response?.data?.message || '删除失败');
      }
    },
    [isAdmin, onUploadSuccess]
  );

  return {
    queue,
    stats,
    addToQueue,
    cancelUpload,
    clearCompleted,
    deleteFile
  };
};

export default useUploadQueue;
