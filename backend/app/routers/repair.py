"""Image repair router - OpenCV inpainting for artifact images."""

import base64
import io
import ipaddress
import re
from urllib.parse import urlparse

import cv2
import numpy as np
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from PIL import Image
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.services import artifact as artifact_service

router = APIRouter()

# Maximum image size: 10 MB
_MAX_IMAGE_SIZE = 10 * 1024 * 1024
# Stream read chunk size: 1 MB
_READ_CHUNK_SIZE = 1024 * 1024

# Denied private IP patterns (CIDR ranges expressed as regex for hostname matching)
_PRIVATE_HOST_PATTERNS = [
    re.compile(r"^localhost$", re.IGNORECASE),
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^172\.(1[6-9]|2[0-9]|3[01])\."),
    re.compile(r"\.local$", re.IGNORECASE),
]


def _validate_image_url(url: str) -> None:
    """Validate image URL against SSRF: hostname/IP, size, Content-Type.

    Raises HTTPException with 400 if validation fails.
    """
    parsed = urlparse(url)

    if parsed.scheme and parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 HTTP/HTTPS 协议",
        )

    hostname = parsed.hostname

    if not hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的 URL: 无法解析主机名",
        )

    # 1. IP check: reject private / loopback / link-local IPs
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="禁止访问内网、回环或链路本地地址",
            )
    except ValueError:
        # Not an IP, proceed to domain check
        pass

    # 2. Domain check: reject internal domains
    for pattern in _PRIVATE_HOST_PATTERNS:
        if pattern.search(hostname):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="禁止访问内网域名",
            )


def download_image(url: str) -> np.ndarray:
    """Download image from URL with SSRF protection and return as numpy array."""
    _validate_image_url(url)

    try:
        with requests.get(
            url,
            timeout=(5, 10),
            headers={"User-Agent": "Mozilla/5.0"},
            stream=True,
        ) as resp:
            resp.raise_for_status()

            # 3. Content-Type check: only allow image/*
            content_type = resp.headers.get("Content-Type", "")
            if not content_type.startswith("image/"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"无效的 Content-Type: {content_type}，只允许 image/*",
                )

            # 4. Size check: stream and cap at 10 MB
            content = bytearray()
            for chunk in resp.iter_content(chunk_size=_READ_CHUNK_SIZE):
                content.extend(chunk)
                if len(content) > _MAX_IMAGE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"图片大小超过最大限制 {_MAX_IMAGE_SIZE // (1024 * 1024)} MB",
                    )

            pil_img = Image.open(io.BytesIO(content))
            # Convert to RGB if necessary (handles RGBA, grayscale, etc.)
            if pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")
            return np.array(pil_img)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无法下载图片: {str(e)}",
        )


@router.post("/{artifact_id}/repair-image")
async def repair_image(
    artifact_id: int,
    mask: UploadFile = File(..., description="用户涂抹的遮罩图片（PNG，白色区域为待修复区域）"),
    radius: int = Form(default=3, ge=1, le=20, description="修复半径"),
    method: str = Form(default="telea", description="修复算法：telea 或 ns"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    使用 OpenCV inpaint 修复文物图片。

    - mask: 用户上传的遮罩图片，白色区域表示需要修复的部分
    - radius: 修复算法的半径参数
    - method: 'telea' (TELEA算法) 或 'ns' (Navier-Stokes算法)
    - 返回修复后的图片 base64 编码
    """
    # 获取文物信息
    # NOTE: OpenCV and requests are sync libraries; threadpool is required.
    # The `db` session stays open because `await` blocks until completion.
    artifact = await run_in_threadpool(lambda: artifact_service.get_artifact_by_id(db, artifact_id))
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"文物 ID {artifact_id} 不存在",
        )

    if not artifact.image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该文物没有图片",
        )

    # 验证修复算法
    if method not in ("telea", "ns"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="method 必须是 'telea' 或 'ns'",
        )
    inpaint_flag = cv2.INPAINT_TELEA if method == "telea" else cv2.INPAINT_NS

    # 下载原图
    original_img = download_image(artifact.image_url)
    # OpenCV uses BGR, convert from RGB
    original_bgr = cv2.cvtColor(original_img, cv2.COLOR_RGB2BGR)

    # 读取 mask 图片
    try:
        mask_bytes = await mask.read()  # type: ignore
        mask_pil = Image.open(io.BytesIO(mask_bytes))
        if mask_pil.mode != "L":
            mask_pil = mask_pil.convert("L")
        mask_np = np.array(mask_pil)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无法读取遮罩图片: {str(e)}",
        )

    # 检查 mask 和原图尺寸是否匹配
    if mask_np.shape[:2] != original_bgr.shape[:2]:
        # resize mask to match original image
        mask_np = cv2.resize(mask_np, (original_bgr.shape[1], original_bgr.shape[0]))

    # 确保是二值 mask（阈值处理）
    _, mask_binary = cv2.threshold(mask_np, 127, 255, cv2.THRESH_BINARY)

    # 执行 inpaint
    repaired_bgr = cv2.inpaint(original_bgr, mask_binary, radius, inpaint_flag)

    # 转回 RGB 并编码为 base64
    repaired_rgb = cv2.cvtColor(repaired_bgr, cv2.COLOR_BGR2RGB)
    repaired_pil = Image.fromarray(repaired_rgb)
    buffer = io.BytesIO()
    repaired_pil.save(buffer, format="PNG")
    repaired_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return JSONResponse(
        content={
            "success": True,
            "artifact_id": artifact_id,
            "artifact_name": artifact.name,
            "repaired_image": repaired_base64,
            "method": method,
            "radius": radius,
        }
    )
