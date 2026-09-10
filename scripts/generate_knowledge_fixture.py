# -*- coding: utf-8 -*-
"""生成 EquipForge 智能装备选型的合成知识库快照。"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_KNOWLEDGE = _ROOT / "knowledge"
_MANIFEST = _KNOWLEDGE / "manifest.jsonl"
_FACETS = (
    ("overview", "场景拆解", "把自然语言需求转成工况、任务目标、节拍、预算和部署边界"),
    ("parameters", "参数判断", "区分硬约束、性能指标与偏好项，并保留数值单位和测试条件"),
    ("compatibility", "兼容性", "核对机械、电气、通信、软件和环境条件能否组成可落地方案"),
    ("integration", "集成实施", "规划安装、标定、联调、验收以及异常降级路径"),
    ("budget", "预算评估", "比较设备价、必要附件、集成调试和后期维护构成的样例总成本"),
    ("risks", "风险避坑", "识别参数口径、接口错配、工况变化和证据不足带来的选型风险"),
)


@dataclass(frozen=True)
class EquipmentCategory:
    slug: str
    name: str
    scope: str
    parameters: tuple[str, ...]
    compatibility: tuple[str, ...]
    risks: tuple[str, ...]
    scenarios: tuple[str, ...]


_CATEGORIES = (
    EquipmentCategory("industrial-camera", "工业相机", "机器视觉采集与在线检测",
        ("成像方式与快门类型", "有效分辨率与像元尺寸", "帧率、曝光和触发", "动态范围与信噪表现", "镜头接口与传感器靶面", "数据接口与传输距离", "供电方式与功耗", "防护、温度和安装尺寸"),
        ("镜头像面和接口", "光源触发与控制", "主机带宽和驱动", "视觉软件与图像格式", "产线编码器或外部触发"),
        ("只看像素忽略视野精度", "运动目标使用不合适的快门", "带宽不足导致丢帧", "镜头成像圈覆盖不足", "现场照明变化未留余量"),
        ("流水线外观缺陷检测", "机械臂定位引导", "字符与条码识别", "高速运动目标抓拍")),
    EquipmentCategory("lens-lighting", "镜头与光源", "机器视觉成像链路设计",
        ("视野、工作距离和目标尺寸", "焦距与放大倍率", "接口和成像圈", "景深与光圈", "畸变和分辨能力", "光源形态与照射角度", "波段、亮度与均匀性", "频闪响应和控制方式"),
        ("相机传感器尺寸", "镜头接口与后焦", "光源控制器通道", "触发电平和时序", "安装空间与散热"),
        ("先选镜头再确认视野", "忽略传感器靶面造成暗角", "反光表面照明角度不当", "景深不足导致边缘失焦", "频闪亮度与占空比超限"),
        ("金属表面划痕检测", "透明件轮廓测量", "平面字符均匀照明", "小尺寸零件精密成像")),
    EquipmentCategory("industrial-sensor", "工业传感器", "状态感知、位置检测与过程测量",
        ("被测量类型与量程", "精度、重复性和分辨率", "响应时间与采样频率", "检测距离与盲区", "输出信号和接线制式", "供电电压与功耗", "安装方式和结构尺寸", "温湿度、防护与抗干扰"),
        ("控制器输入类型", "模拟量程或数字协议", "电气隔离与接地", "线缆长度和连接器", "标定、诊断与维护工具"),
        ("把分辨率当作绝对精度", "量程过大损失有效分辨率", "忽略被测材质差异", "噪声环境没有屏蔽接地", "响应速度不满足产线节拍"),
        ("工件到位检测", "压力与重量采集", "设备振动监测", "液位或距离测量")),
    EquipmentCategory("edge-controller", "边缘控制器", "现场控制、协议汇聚与边缘推理",
        ("处理器架构与计算负载", "内存和本地存储", "数字量与模拟量点数", "实时性与任务周期", "工业网络和现场总线", "扩展槽与外设接口", "操作系统和软件运行环境", "供电、散热与环境等级"),
        ("现有 PLC 或上位机协议", "I/O 电平和隔离", "容器或推理运行时", "远程运维与日志", "机柜空间和电源预算"),
        ("峰值算力代替持续性能", "接口数量够但协议不兼容", "忽略实时控制确定性", "散热条件不足触发降频", "软件依赖无法离线部署"),
        ("视觉推理边缘部署", "多设备数据汇聚", "产线逻辑与运动协同", "设备预测性维护网关")),
    EquipmentCategory("motion-control", "运动控制设备", "执行机构驱动与多轴轨迹控制",
        ("轴数与运动拓扑", "负载、转矩和惯量", "速度、加速度与行程", "定位精度和重复精度", "控制周期与同步能力", "编码器和反馈类型", "功率等级与制动需求", "机械安装和安全功能"),
        ("电机与驱动器额定范围", "编码器协议和分辨率", "控制器总线周期", "机械传动比与惯量匹配", "限位、急停和安全回路"),
        ("只按额定转矩选型", "忽略加减速峰值负载", "定位精度与重复精度混淆", "多轴同步周期不满足轨迹", "机械共振没有调试余量"),
        ("机械臂关节驱动", "直线模组定位", "输送线同步跟踪", "点胶或装配轨迹控制")),
    EquipmentCategory("communication-acquisition", "通信与采集模块", "工业数据接入、协议转换与信号采集",
        ("通道数量与信号类型", "采样率和同步方式", "分辨率与输入量程", "隔离耐受与共模范围", "现场总线和上行协议", "时间戳与缓存能力", "连接器、接线与扩展", "供电、温度和防护条件"),
        ("传感器输出和激励", "控制器或服务器协议", "网络拓扑与地址规划", "时钟同步和数据格式", "驱动、SDK 与配置工具"),
        ("总采样率误当单通道采样率", "隔离指标不足引入地环路", "协议名称相同但对象模型不同", "网络拥塞没有缓存策略", "时间戳来源不一致无法对齐"),
        ("多路模拟信号采集", "老旧设备协议转换", "分布式 I/O 扩展", "设备能耗与状态采集")),
)


def _document_body(category: EquipmentCategory, facet_name: str, facet_focus: str) -> str:
    lines = [f"# {category.name}：{facet_name}", "", "## 适用范围与资料边界",
        f"本文服务于 EquipForge 的{category.scope}选型演示，重点是{facet_focus}。这是合成的演示快照，不对应任何真实厂商、型号、报价或库存，也不能替代现场测试、产品手册、安全评审与工程签字。", "", "## 需求输入",
        f"处理{category.name}{facet_name}需求时，先记录任务对象、工作节拍、现场空间、环境条件、现有系统、预算上限和验收方式。对于{category.name}{facet_name}中的高精度、高速、稳定等模糊表述，必须追问可测量的阈值及测试条件，再决定是否进入候选比较。", "", "## 核心参数检查"]
    for index, parameter in enumerate(category.parameters, start=1):
        scenario = category.scenarios[(index - 1) % len(category.scenarios)]
        lines += [f"### {index}. {parameter}", f"在{scenario}中执行{category.name}{facet_name}并核对“{parameter}”时，应保存数值、单位、上下限和测量前提。{category.name}{facet_name}不得只依据标题关键词判断满足条件；字段缺失应标为待确认，候选排序需要说明该参数如何影响任务目标。", ""]
    lines += ["## 兼容性清单"]
    for index, item in enumerate(category.compatibility, start=1):
        lines += [f"### C{index}. {item}", f"围绕{category.name}{facet_name}的{item}建立输入端、输出端和约束条件三列表。{category.name}{facet_name}中接口名称一致并不自动代表可互操作，还要确认物理层、信号范围、协议版本、数据格式、时序以及必要附件；不能确认的项目进入联调验证单。", ""]
    lines += ["## 常见风险与处置"]
    for index, risk in enumerate(category.risks, start=1):
        lines += [f"### R{index}. {risk}", f"“{risk}”会使{category.name}{facet_name}产生表面匹配、实际不可用的结果。{category.name}{facet_name}的处置方法是回到任务工况补齐证据，给出验证步骤和不通过时的替代边界；没有测试或字段支持时，不作确定性推荐。", ""]
    lines += ["## 决策与验收流程", f"{category.name}{facet_name}的第一步是冻结硬约束并排除不满足项；第二步按{facet_focus}比较剩余候选；第三步核对附件、集成和维护成本；第四步输出首选、备选和待确认项；第五步在代表性工况下执行小规模验证，记录参数、现象与通过标准。", "", "## 推荐输出格式", f"EquipForge 应依次展示{category.name}{facet_name}需求摘要、候选参数表、兼容性差异、风险提示、样例预算以及验证计划。{category.name}{facet_name}中的价格仅作为合成比较字段，库存仅作为流程演示字段；证据冲突时以用户提供的最新可核验资料为准。"]
    return "\n".join(lines) + "\n"


def _entry(filename: str, category: EquipmentCategory, facet: str) -> dict[str, str]:
    return {"document_id": Path(filename).stem, "filename": filename,
        "source": "EquipForge 离线选型知识快照（合成演示）", "source_type": "synthetic_evaluation_fixture",
        "published_at": "2026-09-10", "effective_from": "2026-09-10", "effective_to": "2027-09-10",
        "region": "GLOBAL", "version": "2026.09-equipforge-v1", "topic": "equipment_selection",
        "category": category.slug, "facet": facet}


def build_manifest() -> list[dict[str, str]]:
    _KNOWLEDGE.mkdir(parents=True, exist_ok=True)
    documents: dict[str, str] = {}
    entries: list[dict[str, str]] = []
    for category in _CATEGORIES:
        base_filename = f"{category.slug}.md"
        documents[base_filename] = _document_body(category, "综合指南", "形成从需求澄清到验证验收的完整决策链")
        entries.append(_entry(base_filename, category, "guide"))
        for facet_slug, facet_name, facet_focus in _FACETS:
            filename = f"eval-{category.slug}-{facet_slug}.md"
            documents[filename] = _document_body(category, facet_name, facet_focus)
            entries.append(_entry(filename, category, facet_slug))
    # knowledge/ 是本地合成夹具目录；白名单同步防止旧电商资料被运行时 glob 重新入库。
    for path in _KNOWLEDGE.glob("*.md"):
        if path.name not in documents:
            path.unlink()
    for filename, body in documents.items():
        (_KNOWLEDGE / filename).write_text(body, encoding="utf-8")
    return entries


def main() -> None:
    entries = build_manifest()
    _MANIFEST.write_text("\n".join(json.dumps(entry, ensure_ascii=False, sort_keys=True) for entry in entries) + "\n", encoding="utf-8")
    print(f"已生成 {len(entries)} 篇 EquipForge 知识文档与 {_MANIFEST}")


if __name__ == "__main__":
    main()
