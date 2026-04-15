import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Button, Slider, Radio, message, Space, Spin, Alert } from 'antd';
import {
  EditOutlined,
  ReloadOutlined,
  DownloadOutlined,
  CheckOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { repairImage, type Artifact } from '../api/artifacts';

interface ImageRepairProps {
  artifact: Artifact;
  onClose?: () => void;
}

type RepairMethod = 'telea' | 'ns';

export default function ImageRepair({ artifact, onClose }: ImageRepairProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // 绘制状态
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  // 修复参数
  const [radius, setRadius] = useState(3);
  const [method, setMethod] = useState<RepairMethod>('telea');

  // 修复结果
  const [repairedImage, setRepairedImage] = useState<string | null>(null);
  const [repairInfo, setRepairInfo] = useState<{
    artifact_name: string;
    method: string;
    radius: number;
  } | null>(null);

  // 加载原图
  useEffect(() => {
    if (!artifact.image_url || !canvasRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      originalImageRef.current = img;
      const canvas = canvasRef.current!;
      const maskCanvas = maskCanvasRef.current!;

      // 设置 canvas 尺寸
      canvas.width = img.width;
      canvas.height = img.height;
      maskCanvas.width = img.width;
      maskCanvas.height = img.height;

      // 绘制原图
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // 清空 mask
      const maskCtx = maskCanvas.getContext('2d')!;
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

      setImageLoaded(true);
      setImageError(false);
    };

    img.onerror = () => {
      setImageError(true);
      setImageLoaded(false);
      message.error('图片加载失败，可能是跨域限制');
    };

    img.src = artifact.image_url;
  }, [artifact.image_url]);

  // 获取鼠标在 canvas 上的位置
  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // 绘制 mask（半透明红色）
  const drawMask = useCallback((x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current!;
    const ctx = maskCanvas.getContext('2d')!;

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
  }, [brushSize]);

  // 开始绘制
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingEnabled || !imageLoaded) return;
    setIsDrawing(true);
    const pos = getMousePos(e);
    drawMask(pos.x, pos.y);
  }, [drawingEnabled, imageLoaded, getMousePos, drawMask]);

  // 绘制中
  const handleDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawingEnabled) return;
    const pos = getMousePos(e);
    drawMask(pos.x, pos.y);
  }, [isDrawing, drawingEnabled, getMousePos, drawMask]);

  // 结束绘制
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // 清除 mask
  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current!;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    setRepairedImage(null);
    setRepairInfo(null);
  }, []);

  // 生成纯白 mask（用于提交）
  const generateWhiteMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current!;

    // 创建临时 canvas 用于生成白色 mask
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = maskCanvas.width;
    tempCanvas.height = maskCanvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;

    // 白色背景
    tempCtx.fillStyle = '#000000';  // 黑色背景（非修复区域）
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // 从 mask canvas 获取红色绘制区域，转为白色
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    for (let i = 0; i < maskData.data.length; i += 4) {
      // 如果有红色像素（用户绘制的区域）
      if (maskData.data[i] > 0 || maskData.data[i + 1] > 0 || maskData.data[i + 2] > 0) {
        // 设为白色（待修复区域）
        tempCtx.fillStyle = '#ffffff';
        const x = (i / 4) % maskCanvas.width;
        const y = Math.floor((i / 4) / maskCanvas.width);
        tempCtx.fillRect(x, y, 1, 1);
      }
    }

    return tempCanvas;
  }, []);

  // 提交修复
  const handleRepair = async () => {
    if (!imageLoaded || !artifact.image_url) return;

    const maskCanvas = maskCanvasRef.current!;
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    // 检查是否有绘制区域
    let hasMask = false;
    for (let i = 0; i < maskData.data.length; i += 4) {
      if (maskData.data[i] > 0 || maskData.data[i + 1] > 0 || maskData.data[i + 2] > 0) {
        hasMask = true;
        break;
      }
    }

    if (!hasMask) {
      message.warning('请先绘制需要修复的区域');
      return;
    }

    setLoading(true);
    try {
      // 生成白色 mask
      const whiteMaskCanvas = generateWhiteMask();

      // 转换为 PNG blob
      const blob = await new Promise<Blob>((resolve) => {
        whiteMaskCanvas.toBlob((b) => resolve(b!), 'image/png');
      });

      // 创建 File 对象
      const maskFile = new File([blob], 'mask.png', { type: 'image/png' });

      // 调用修复 API
      const result = await repairImage({
        artifactId: artifact.id,
        maskFile,
        radius,
        method,
      });

      setRepairedImage(result.repaired_image);
      setRepairInfo({
        artifact_name: result.artifact_name,
        method: result.method,
        radius: result.radius,
      });
      message.success('图像修复完成');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '修复失败';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 下载修复后的图片
  const handleDownload = () => {
    if (!repairedImage) return;

    const link = document.createElement('a');
    link.href = `data:image/png;base64,${repairedImage}`;
    link.download = `${artifact.name}_repaired.png`;
    link.click();
  };

  // 没有图片的情况
  if (!artifact.image_url) {
    return (
      <Alert
        type="warning"
        message="该文物暂无图片"
        description="无法进行图像修复"
        showIcon
      />
    );
  }

  return (
    <Card
      title="图像修复"
      extra={onClose && (
        <Button size="small" onClick={onClose}>
          返回详情
        </Button>
      )}
      style={{
        borderRadius: 'var(--r-card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* 工具栏 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Space>
          <Button
            type={drawingEnabled ? 'primary' : 'default'}
            icon={<EditOutlined />}
            onClick={() => setDrawingEnabled(!drawingEnabled)}
          >
            {drawingEnabled ? '绘制模式开启' : '开启绘制'}
          </Button>
          <Button
            icon={<UndoOutlined />}
            onClick={clearMask}
            disabled={!imageLoaded}
          >
            清除遮罩
          </Button>
        </Space>

        {drawingEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>笔刷大小:</span>
            <Slider
              value={brushSize}
              onChange={setBrushSize}
              min={5}
              max={50}
              style={{ width: 100 }}
            />
            <span style={{ fontSize: 13 }}>{brushSize}</span>
          </div>
        )}
      </div>

      {/* 修复参数 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>修复算法:</span>
        <Radio.Group value={method} onChange={(e) => setMethod(e.target.value)} size="small">
          <Radio.Button value="telea">TELEA</Radio.Button>
          <Radio.Button value="ns">Navier-Stokes</Radio.Button>
        </Radio.Group>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>修复半径:</span>
          <Slider
            value={radius}
            onChange={setRadius}
            min={1}
            max={10}
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 13 }}>{radius}</span>
        </div>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleRepair}
          loading={loading}
          disabled={!imageLoaded}
        >
          开始修复
        </Button>
      </div>

      {/* 图片区域 */}
      <Spin spinning={loading} tip="正在修复...">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* 原图 + mask */}
          <div style={{ flex: '1 1 300px', minWidth: 300 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              原始图片 {drawingEnabled && '（红色区域为待修复部分）'}
            </div>
            <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 4 }}>
              {imageError ? (
                <div style={{
                  height: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-panel)',
                  color: 'var(--text-muted)',
                }}>
                  图片加载失败
                </div>
              ) : (
                <>
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: '100%',
                      maxWidth: 400,
                      height: 'auto',
                      display: 'block',
                    }}
                  />
                  <canvas
                    ref={maskCanvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={handleDraw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      maxWidth: 400,
                      height: 'auto',
                      cursor: drawingEnabled ? 'crosshair' : 'default',
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* 修复结果 */}
          <div style={{ flex: '1 1 300px', minWidth: 300 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              修复结果
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
              {repairedImage ? (
                <img
                  src={`data:image/png;base64,${repairedImage}`}
                  alt="修复结果"
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    height: 'auto',
                    display: 'block',
                  }}
                />
              ) : (
                <div style={{
                  height: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-panel)',
                  color: 'var(--text-muted)',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <span style={{ fontSize: 24 }}>🔧</span>
                  <span>绘制遮罩后点击修复</span>
                </div>
              )}
            </div>
            {repairInfo && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                算法: {repairInfo.method} | 半径: {repairInfo.radius}
              </div>
            )}
          </div>
        </div>
      </Spin>

      {/* 操作按钮 */}
      {repairedImage && (
        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownload}
            >
              下载修复图片
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={clearMask}
            >
              重新绘制
            </Button>
          </Space>
        </div>
      )}
    </Card>
  );
}