# -*- coding: utf-8 -*-
"""生成 EquipForge 可复现合成设备目录（500 SPU / 705 SKU）。

覆盖工业相机、镜头光源、工业传感器、边缘控制器、运动控制和通信采集。
所有品牌、型号、价格、库存、评分及供应渠道都是确定性演示字段，不对应
真实厂商或实时市场数据。运行时仅加载生成的 JSONL。
"""
from __future__ import annotations

import json
from pathlib import Path


_OUT = Path(__file__).resolve().parents[1] / "data" / "catalog-v1.jsonl"
_PLATFORMS = ("synthetic-direct", "synthetic-integrator", "synthetic-lab", "synthetic-marketplace")
_CURRENCIES = ("CNY", "USD", "EUR", "JPY", "SGD")
_ORIGINS = ("CN", "DE", "JP", "SG", "US", "KR")
_DESTINATIONS = (
    ["CN"], ["US"], ["EU"], ["JP"], ["SG"],
    ["CN", "US"], ["CN", "EU"], ["US", "EU", "JP"], ["CN", "US", "EU", "JP", "SG"],
)

# 品类、虚构品牌系列、设备名、检索关键词、能力标签、参数亮点。
_CATEGORIES = (
    ("工业相机", "ForgeVision", "机器视觉工业相机",
     "机器视觉 缺陷检测 全局快门 CMOS 外触发 GigE Vision 流水线",
     ("GigE Vision", "全局快门", "外触发"),
     (("分辨率", "500万像素 2448×2048"), ("帧率", "35 fps"), ("接口", "GigE Vision"))),
    ("镜头光源", "OptiSpark", "机器视觉镜头光源套件",
     "工业镜头 环形光源 低畸变 远心照明 C口 缺陷检测",
     ("C口", "低畸变", "频闪控制"),
     (("焦距", "16 mm"), ("光源", "24 V 环形光"), ("接口", "C-mount"))),
    ("工业传感器", "SenseCraft", "工业精密传感器",
     "机械臂 力控 位移检测 高精度 IO-Link EtherCAT 实时反馈",
     ("IO-Link", "高精度", "IP67"),
     (("量程", "0–100 mm"), ("重复精度", "±0.02 mm"), ("防护", "IP67"))),
    ("边缘控制器", "EdgePilot", "工业边缘控制器",
     "边缘计算 PLC 控制器 Modbus TCP 数字量输入 DI 工业网关",
     ("Modbus TCP", "8路DI", "边缘计算"),
     (("数字量输入", "8 路 DI"), ("协议", "Modbus TCP"), ("网口", "双千兆以太网"))),
    ("运动控制", "MotionWeave", "多轴运动控制器",
     "伺服 步进 多轴同步 EtherCAT 脉冲控制 机械臂 定位",
     ("EtherCAT", "多轴同步", "位置控制"),
     (("控制轴数", "4 轴"), ("总线", "EtherCAT"), ("周期", "1 ms"))),
    ("通信采集", "LinkFoundry", "工业通信采集模块",
     "数据采集 模拟量 数字量 RS485 CAN Modbus RTU 工业通信",
     ("RS485", "Modbus RTU", "隔离采集"),
     (("采集通道", "8 路"), ("接口", "RS485/CAN"), ("隔离", "2.5 kV"))),
)


def _price(index: int, currency: str) -> float:
    """返回覆盖低、中、高价格带的合成参考价。"""
    cny = (189, 699, 2499, 5899, 12999, 32999, 82999)[index % 7]
    if currency == "CNY":
        return float(cny)
    if currency == "USD":
        return round(cny / 7.1, 2)
    if currency == "EUR":
        return round(cny / 7.8, 2)
    if currency == "JPY":
        return round(cny / 0.048)
    return round(cny / 5.3, 2)


def _specialized_fields(index: int):
    """为三条验收查询保留明确强正例。"""
    if index == 0:
        return (
            "ForgeVision GV-500 全局快门工业相机",
            "500万像素 CMOS 全局快门工业相机，支持 GigE Vision 和硬件外触发，适合流水线高速缺陷检测。",
            [("分辨率", "2448×2048"), ("快门", "全局快门"), ("帧率", "35 fps"), ("接口", "GigE Vision")],
            ("GigE Vision", "全局快门", "外触发", "缺陷检测"),
        )
    if index == 101:
        return (
            "EdgePilot EC-8DI Modbus TCP 边缘控制器",
            "工业边缘控制器，提供 8 路数字量输入 DI、Modbus TCP、双千兆网口和规则引擎，适合产线数据接入。",
            [("数字量输入", "8 路 DI"), ("协议", "Modbus TCP"), ("网口", "双千兆以太网"), ("供电", "24 VDC")],
            ("Modbus TCP", "8路DI", "边缘计算", "24VDC"),
        )
    if index == 102:
        return (
            "ForgeVision RobotPose-3D 机械臂视觉定位套件",
            "面向机械臂抓取与装配的 3D 视觉定位设备，提供手眼标定、点云匹配和实时位姿输出。",
            [("定位精度", "±0.10 mm"), ("输出", "6D 位姿"), ("接口", "GigE/PROFINET"), ("标定", "手眼标定")],
            ("机械臂", "视觉定位", "3D视觉", "手眼标定"),
        )
    return None, None, None, None


def _hard_negative_fields(category: str):
    """返回标题同类、关键约束明确冲突的评测候选。"""
    return {
        "工业相机": (
            "卷帘快门 USB2.0 工业相机，仅 15 fps，不支持硬件外触发；不满足高速全局快门缺陷检测约束。",
            [("快门", "卷帘快门"), ("帧率", "15 fps"), ("接口", "USB 2.0")],
            ("卷帘快门", "USB2.0", "无外触发"),
        ),
        "镜头光源": (
            "普通定焦镜头与常亮光源套件，畸变率 3%，不支持频闪控制；不满足低畸变高速成像约束。",
            [("畸变", "3%"), ("光源", "常亮"), ("频闪", "不支持")],
            ("普通定焦", "常亮光源", "无频闪"),
        ),
        "工业传感器": (
            "通用位移开关，重复精度 ±1 mm、IP40，仅开关量输出；不满足高精度 IO-Link 约束。",
            [("重复精度", "±1 mm"), ("防护", "IP40"), ("输出", "开关量")],
            ("低精度", "IP40", "开关量"),
        ),
        "边缘控制器": (
            "串口采集控制器，仅 4 路 DI 和 Modbus RTU，不支持 Modbus TCP；不满足 8 路 DI 以太网约束。",
            [("数字量输入", "4 路 DI"), ("协议", "Modbus RTU"), ("网口", "无")],
            ("Modbus RTU", "4路DI", "无以太网"),
        ),
        "运动控制": (
            "单轴脉冲运动控制器，不支持 EtherCAT 与多轴同步；不满足机械臂协同控制约束。",
            [("控制轴数", "1 轴"), ("接口", "脉冲/方向"), ("总线", "不支持 EtherCAT")],
            ("单轴", "脉冲控制", "无EtherCAT"),
        ),
        "通信采集": (
            "2 路非隔离 RS232 采集模块，不支持 RS485、CAN 或 Modbus RTU；不满足工业隔离采集约束。",
            [("采集通道", "2 路"), ("接口", "RS232"), ("隔离", "无")],
            ("RS232", "非隔离", "2路采集"),
        ),
    }[category]


def _record(index: int) -> dict:
    category, brand_prefix, noun, keywords, capability_tags, highlight_specs = _CATEGORIES[index % 6]
    if index == 101:  # EC-8DI 属于边缘控制器。
        category, brand_prefix, noun, keywords, capability_tags, highlight_specs = _CATEGORIES[3]
    if index == 102:  # RobotPose 属于工业相机/视觉设备。
        category, brand_prefix, noun, keywords, capability_tags, highlight_specs = _CATEGORIES[0]

    product_id = f"P{1001 + index:04d}"
    platform = _PLATFORMS[index % len(_PLATFORMS)]
    currency = _CURRENCIES[index % len(_CURRENCIES)]
    multi_sku = index < 205
    fully_out = 1 <= index <= 50
    partially_out = 51 <= index <= 100
    special_title, special_description, special_highlights, special_tags = _specialized_fields(index)

    title = special_title or f"{brand_prefix} {noun} EF-{index:03d}"
    description = special_description or (
        f"{keywords}；合成演示型号 EF-{index:03d}，用于 EquipForge 设备检索、参数筛选与方案比较。"
    )
    highlights = special_highlights or list(highlight_specs) + [("数据声明", "合成演示参数")]
    tags = special_tags or capability_tags
    if 1 <= index <= 75:
        negative_description, negative_highlights, negative_tags = _hard_negative_fields(category)
        description = f"{negative_description} 合成演示型号 EF-{index:03d}，用于困难负例评测。"
        highlights = negative_highlights + [("数据声明", "合成演示参数")]
        tags = negative_tags

    skus = []
    for variant in range(2 if multi_sku else 1):
        if index == 0:  # 保留历史订单测试依赖的库存契约。
            stock = (50, 30)[variant]
        elif fully_out:
            stock = 0
        elif partially_out and variant == 0:
            stock = 0
        else:
            stock = 8 + (index * 7 + variant * 11) % 180
        base_price = _price(index + variant, currency)
        skus.append({
            "sku_id": f"{product_id}-S{variant + 1}",
            "spec": "标准工业版" if variant == 0 else "增强防护版",
            "price_major": round(base_price * (1 if variant == 0 else 1.18), 2),
            "currency": currency,
            "stock": stock,
        })

    evaluation_tags = ["hard_negative"] if 1 <= index <= 75 else []
    return {
        "product_id": product_id,
        "title": title,
        "brand": f"{brand_prefix}-{index % 17:02d}",
        "category": category,
        "origin_country": _ORIGINS[index % len(_ORIGINS)],
        "description": description,
        "highlights": [{"label": label, "detail": detail} for label, detail in highlights],
        "ships_to": _DESTINATIONS[index % len(_DESTINATIONS)],
        "skus": skus,
        "source_platform": platform,
        "external_product_id": f"{platform}-{product_id}",
        "canonical_product_id": f"EQ-CAN-{index // 5:03d}",
        # 保持 schema，字段语义迁移为协议/能力标签。
        "material_tags": list(tags),
        "weight_kg": round(0.18 + (index % 40) * 0.37, 2),
        "dimensions_cm": {"length": 8 + index % 33, "width": 6 + index % 21, "height": 3 + index % 17},
        "tax_category": category,
        "rating_summary": {"average": round(3.8 + (index % 12) / 10, 1), "review_count": 20 + index * 13},
        "updated_at": f"2026-08-{1 + index % 28:02d}",
        "evaluation_tags": evaluation_tags,
        "data_provenance": "synthetic_evaluation_fixture",
    }


def build_records() -> list[dict]:
    return [_record(index) for index in range(500)]


def main() -> None:
    records = build_records()
    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _OUT.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False, sort_keys=True) for record in records) + "\n",
        encoding="utf-8",
    )
    print(f"已写入 {_OUT}：{len(records)} SPU，{sum(len(record['skus']) for record in records)} SKU")


if __name__ == "__main__":
    main()
