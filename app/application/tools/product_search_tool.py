# -*- coding: utf-8 -*-
"""product_search_tool

设备检索工具：结构化检索入参 → CatalogSearchUseCase → 设备卡 JSON。
MainAgent 单干与 SearchAgent 派发两条路径共用同一工具实例。
工厂模式注入 UseCase 与 EventBus，模型看到的只是工具入参与返回值结构。

注意：本模块不能用 `from __future__ import annotations`——
AgentScope 用 pydantic 从函数签名动态生成 JSON schema，字符串化注解会解析失败。
"""
import json
from typing import Optional

from agentscope.message import TextBlock, ToolResultState
from agentscope.tool import ToolChunk

from app.application.usecases.catalog_search import CatalogSearchUseCase
from app.domain.catalog.product_search_spec import ProductSearchSpec
from app.domain.catalog.exchange_rate import ExchangeRateTable
from app.domain.shipping.tariff_schedule import TariffSchedule
from app.infrastructure.context import ShoppingContext
from app.infrastructure.eventbus import TradeEventBus
from app.infrastructure.budget import remember_verified_result
from app.infrastructure.persistence.context_evidence import product_decision_view


_KNOWN_CATEGORIES = (
    "工业相机",
    "镜头光源",
    "工业传感器",
    "边缘控制器",
    "运动控制",
    "通信采集",
)

_CATEGORY_ALIASES = {
    "工业相机": ("机器视觉相机", "全局快门", "线阵相机", "面阵相机", "视觉定位"),
    "镜头光源": ("工业镜头", "机器视觉镜头", "环形光源", "条形光源", "背光源"),
    "工业传感器": ("视觉传感器", "力传感器", "位移传感器", "温度传感器", "接近传感器"),
    "边缘控制器": ("边缘计算", "工业网关", "PLC", "数字量输入", "边缘控制"),
    "运动控制": ("伺服驱动", "运动控制器", "EtherCAT", "脉冲控制", "多轴控制"),
    "通信采集": ("数据采集", "采集模块", "通信模块", "Modbus", "CANopen", "RS485"),
}


def _normalize_category(category: Optional[str], normalized_query: str) -> Optional[str]:
    """把模型给出的叶子类目收敛到目录一级类目；无法识别时不施加错误硬过滤。"""
    for known in _KNOWN_CATEGORIES:
        if category == known or (category and known in category):
            return known
    haystacks = [value for value in (category, normalized_query) if value]
    for known, aliases in _CATEGORY_ALIASES.items():
        if any(alias in value for value in haystacks for alias in aliases):
            return known
    return next((known for known in _KNOWN_CATEGORIES if known in normalized_query), None)


def build_product_search_tool(usecase: CatalogSearchUseCase, bus: TradeEventBus, evidence_store=None):
    async def product_search_tool(
        normalized_query: str,
        category: Optional[str] = None,
        ship_to: Optional[str] = None,
        top_k: int | str = 5,
        price_max_major: float | str | None = None,
        target_currency: str = "CNY",
        excluded_material_tags: list[str] | None = None,
        required_material_tags: list[str] | None = None,
    ) -> ToolChunk:
        """检索智能装备目录（embedding+rerank 二阶段召回），返回 Top-K 设备卡 JSON。
        传入 ship_to 时设备卡自动内联 landed_price 供货成本明细（设备小计+运输+税费，统一折算 target_currency），
        无需另行计算价格。

        Args:
            normalized_query (`str`):
                标准化检索词，保留设备品类、应用场景与关键参数（如“流水线缺陷检测 全局快门 GigE Vision”）。
            category (`str | None`):
                品类槽位，可选，如“工业相机”“边缘控制器”。
            ship_to (`str | None`):
                供货国家或地区二位码，可选，如 "CN"、"US"；传入后过滤不可供货设备并内联成本。
            top_k (`int`):
                返回候选数量，默认 5。
            price_max_major (`float | None`):
                价格上限（target_currency 主单位），用户有预算硬约束时必传，由检索链路结构化过滤。
            target_currency (`str`):
                价格口径币种，默认 "CNY"。
            excluded_material_tags (`list[str] | None`):
                设备标签黑名单，仅在用户明确排除目录中的某个标签时传入。
            required_material_tags (`list[str] | None`):
                设备标签白名单，如必须支持某个已结构化登记的接口标签时传入。
        """
        # 模型有时会把数字参数当字符串传（实测 qwen3-max 传 "300"），
        # schema 层放宽为接受数字字符串，这里统一强转后再进检索链路。
        if isinstance(top_k, str):
            try:
                top_k = int(top_k)
            except ValueError:
                return ToolChunk(
                    content=[TextBlock(type="text", text=f"[error] top_k 非法：{top_k}")],
                    state=ToolResultState.ERROR,
                )
        if isinstance(price_max_major, str):
            try:
                price_max_major = float(price_max_major)
            except ValueError:
                return ToolChunk(
                    content=[TextBlock(type="text", text=f"[error] price_max_major 非法：{price_max_major}")],
                    state=ToolResultState.ERROR,
                )
        snapshot_ctx = ShoppingContext.current()
        context_exclusions = list(snapshot_ctx.excluded_material_tags) if snapshot_ctx else []
        excluded_material_tags = list(
            dict.fromkeys([*context_exclusions, *(excluded_material_tags or [])]),
        )
        category = _normalize_category(category, normalized_query)
        session_id = ShoppingContext.current_session_id()
        args = {
            "normalized_query": normalized_query,
            "category": category,
            "ship_to": ship_to,
            "top_k": top_k,
            "price_max_major": price_max_major,
            "target_currency": target_currency,
            "excluded_material_tags": excluded_material_tags or [],
            "required_material_tags": required_material_tags or [],
        }
        bus.publish(session_id, "tool.invoke", {"tool": "product_search_tool", "args": args})
        if ship_to and ship_to not in TariffSchedule(ExchangeRateTable()).supported_destinations():
            error = f"暂不支持的目的国：{ship_to}"
            bus.publish(session_id, "tool.result", {"tool": "product_search_tool", "error": error})
            return ToolChunk(
                content=[TextBlock(type="text", text=f"[error] {error}")],
                state=ToolResultState.ERROR,
            )
        try:
            spec = ProductSearchSpec(
                normalized_query=normalized_query,
                category=category,
                ship_to=ship_to,
                top_k=top_k,
                price_max_major=price_max_major,
                target_currency=target_currency,
                excluded_material_tags=excluded_material_tags or [],
                required_material_tags=required_material_tags or [],
            )
            result = await usecase.execute(spec)
        except ValueError as err:
            bus.publish(session_id, "tool.result", {"tool": "product_search_tool", "error": str(err)})
            return ToolChunk(
                content=[TextBlock(type="text", text=f"[error] {err}")],
                state=ToolResultState.ERROR,
            )
        remember_verified_result("products", result)
        if evidence_store is not None and snapshot_ctx is not None:
            result["result_ref"] = await evidence_store.save(snapshot_ctx.buyer_id, session_id, "products", result)
        bus.publish(
            session_id,
            "tool.result",
            {
                "tool": "product_search_tool",
                "hit_count": len(result["hits"]),
                "recall_strategy": result["recall_strategy"],
                "total_candidates": result["total_candidates"],
                "rerank_applied": result["rerank_applied"],
                # 商品卡随事件下发，前端无需再调接口即可渲染（含 landed_price 到手价）
                "hits": result["hits"],
                **({"result_ref": result["result_ref"]} if "result_ref" in result else {}),
                **({"filtered_out": result["filtered_out"]} if "filtered_out" in result else {}),
            },
        )
        return ToolChunk(
            content=[TextBlock(type="text", text=json.dumps(product_decision_view(result), ensure_ascii=False))],
            state=ToolResultState.SUCCESS,
        )

    return product_search_tool
