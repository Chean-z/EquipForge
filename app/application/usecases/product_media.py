# -*- coding: utf-8 -*-
"""设备展示媒体：仅映射已生成的示意资源，不推断真实设备照片。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ProductMedia:
    image_url: str | None
    image_kind: Literal["illustration", "placeholder"]
    image_alt: str


# 原电商示意图保留在静态目录中作为历史资产，但不再映射到 EquipForge 设备。
# 后续只有经过来源登记的设备示意图才能加入此映射。
_ILLUSTRATION_FILES: dict[str, str] = {}


def product_media(product_id: str, title: str) -> ProductMedia:
    filename = _ILLUSTRATION_FILES.get(product_id)
    if filename is None:
        return ProductMedia(None, "placeholder", f"{title}：暂无设备图片")
    return ProductMedia(
        f"/products/{filename}", "illustration", f"{title}：AI 生成示意图，非设备实拍",
    )
