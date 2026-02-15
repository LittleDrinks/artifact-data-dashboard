import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { uploadAttachment } from '../services/attachment.service';

const UPLOAD_CONCURRENCY = 2;

const buildDedupeKey = (file) => {
  if (!file) {
    return '';
  }
  const name = String(file.name || '').trim();
  const size = Number(file.size || 0);
  const lastModified = Number(file.lastModified || 0);
  return `${name}@@${size}@@${lastModified}`;
};

export const useUploadQueue = ({ isAdmin, ownerType, ownerId, onUploadSuccess }) => {
  const [uploadQueue, setUploadQueue] = useState([]);
  const uploadAbortMapRef = useRef(new Map());
  const uploadActiveCountRef = useRef(0);
  const uploadShouldRefreshRef = useRef(false);
  const uploadQueueRef = useRef(uploadQueue);

  useEffect(() => {
    uploadQueueRef.current = uploadQueue;
  }, [uploadQueue]);

  useEffect(() => {
    return () => {
      for (const abort of uploadAbortMapRef.current.values()) {
        try {
          abort?.();
        } catch (e) {
          // ignore
        }
      }
      uploadAbortMapRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const hasActive = uploadQueue.some((item) => item.status === 'queued' || item.status === 'uploading');
    if (!hasActive && uploadShouldRefreshRef.current) {
      uploadShouldRefreshRef.current = false;
      onUploadSuccess?.();
    }
  }, [uploadQueue, onUploadSuccess]);

  const setUploadQueueWithRef = useCallback((updater) => {
    setUploadQueue((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      uploadQueueRef.current = next;
      return next;
    });
  }, []);

  const pumpUploadQueue = useCallback(async () => {
    while (uploadActiveCountRef.current < UPLOAD_CONCURRENCY) {
      const next = uploadQueueRef.current.find((item) => item.status === 'queued');
      if (!next) {
        break;
      }

      setUploadQueueWithRef((prev) =>
        prev.map((item) =>
          item.uid === next.uid
            ? {
                ...item,
                status: 'uploading',
                percent: 0
              }
            : item
        )
      );

      uploadActiveCountRef.current += 1;

      (async () => {
        const controller = new AbortController();
        uploadAbortMapRef.current.set(next.uid, () => controller.abort());

        try {
          const resp = await uploadAttachment({
            file: next.file,
            ownerType: ownerType?.trim() || undefined,
            ownerId: ownerId?.trim() || undefined,
            signal: controller.signal,
            onUploadProgress: (evt) => {
              const totalBytes = Number(evt.total || 0);
              const loadedBytes = Number(evt.loaded || 0);
              const percent = totalBytes > 0 ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : 0;
              setUploadQueueWithRef((prev) =>
                prev.map((item) => (item.uid === next.uid ? { ...item, percent } : item))
              );
            }
          });

          uploadShouldRefreshRef.current = true;
          setUploadQueueWithRef((prev) =>
            prev.map((item) =>
              item.uid === next.uid
                ? {
                    ...item,
                    status: 'done',
                    percent: 100,
                    attachmentId: resp.data?.id
                  }
                : item
            )
          );
        } catch (err) {
          if (err.code === 'ERR_CANCELED') {
            setUploadQueueWithRef((prev) =>
              prev.map((item) =>
                item.uid === next.uid ? { ...item, status: 'canceled', error: '已取消' } : item
              )
            );
          } else if (err.response?.status === 403) {
            setUploadQueueWithRef((prev) =>
              prev.map((item) =>
                item.uid === next.uid ? { ...item, status: 'error', error: '权限不足' } : item
              )
            );
          } else {
            setUploadQueueWithRef((prev) =>
              prev.map((item) =>
                item.uid === next.uid
                  ? { ...item, status: 'error', error: err.response?.data?.message || err.message || '上传失败' }
                  : item
              )
            );
          }
        } finally {
          uploadAbortMapRef.current.delete(next.uid);
          uploadActiveCountRef.current = Math.max(0, uploadActiveCountRef.current - 1);
          pumpUploadQueue();
        }
      })();
    }
  }, [ownerId, ownerType, setUploadQueueWithRef]);

  useEffect(() => {
    pumpUploadQueue();
  }, [pumpUploadQueue]);

  const addToQueue = useCallback(
    (files = []) => {
      if (!isAdmin) {
        message.error('权限不足：仅管理员可上传');
        return;
      }

      setUploadQueueWithRef((prev) => {
        const nextItems = [];
        let dedupedCount = 0;

        for (const file of files.filter(Boolean)) {
          const dedupeKey = buildDedupeKey(file);
          const isDuplicate =
            prev.some((item) => item.dedupeKey === dedupeKey && !['error', 'canceled'].includes(item.status)) ||
            nextItems.some((item) => item.dedupeKey === dedupeKey);

          if (dedupeKey && isDuplicate) {
            dedupedCount += 1;
            continue;
          }

          nextItems.push({
            uid: dedupeKey || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            dedupeKey,
            name: file.name,
            file,
            status: 'queued',
            percent: 0
          });
        }

        if (dedupedCount > 0) {
          message.info(`已忽略 ${dedupedCount} 个重复文件`);
        }

        if (!nextItems.length) {
          return prev;
        }

        return [...nextItems, ...prev];
      });
    },
    [isAdmin, setUploadQueueWithRef]
  );

  const cancelUpload = useCallback(
    (uid) => {
      const abort = uploadAbortMapRef.current.get(uid);
      if (abort) {
        abort();
      }
      setUploadQueueWithRef((prev) =>
        prev.map((item) =>
          item.uid === uid && item.status === 'queued' ? { ...item, status: 'canceled', error: '已取消' } : item
        )
      );
    },
    [setUploadQueueWithRef]
  );

  const clearCompleted = useCallback(() => {
    setUploadQueueWithRef((prev) => prev.filter((item) => !['done', 'error', 'canceled'].includes(item.status)));
  }, [setUploadQueueWithRef]);

  const stats = {
    totalCount: uploadQueue.length,
    finishedCount: uploadQueue.filter((item) => ['done', 'error', 'canceled'].includes(item.status)).length,
    uploadingCount: uploadQueue.filter((item) => item.status === 'uploading').length,
    queuedCount: uploadQueue.filter((item) => item.status === 'queued').length,
    percent: uploadQueue.length > 0
      ? Math.round((uploadQueue.filter((item) => ['done', 'error', 'canceled'].includes(item.status)).length / uploadQueue.length) * 100)
      : 0
  };

  return {
    queue: uploadQueue,
    stats,
    addToQueue,
    cancelUpload,
    clearCompleted
  };
};

export default useUploadQueue;
