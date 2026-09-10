import { useState } from "react";
import type { ProductCard } from "../types";
import Icon from "./Icon";
import Modal from "./Modal";
import { money, ProductImage } from "./ProductCards";
export default function ProductDetail({
  product,
  busy,
  onClose,
  onCompare,
  onAsk,
  onPrepare,
}: {
  product: ProductCard;
  busy: boolean;
  onClose: () => void;
  onCompare: (product: ProductCard) => void;
  onAsk: (query: string) => void;
  onPrepare: (product: ProductCard, skuId: string) => void;
}) {
  const [skuId, setSkuId] = useState(
    product.default_sku_id || product.skus[0]?.sku_id || "",
  );
  const sku = product.skus.find((item) => item.sku_id === skuId),
    landed = product.landed_price;
  const canShowLanded =
    skuId === product.default_sku_id &&
    landed &&
    !landed.unavailable_reason &&
    Number.isFinite(landed.landed_total_major);
  return (
    <Modal title={`${product.title} 设备详情`} drawer onClose={onClose}>
      <div className="drawer-visual">
        <ProductImage product={product} />
        <span className="visual-caption">
          {product.image_kind === "illustration"
            ? "设备示意图 · 非实物照片"
            : "暂无设备实拍"}
        </span>
      </div>
      <div className="drawer-kicker">
        {product.brand} · {product.product_id}
      </div>
      <h2>{product.title}</h2>
      <p className="drawer-description">
        {product.description || product.highlights.join("；")}
      </p>
      <div className="price">
        {money(
          sku?.price_major ?? product.price_major,
          sku?.currency ?? product.currency,
        )}
      </div>
      <span className="detail-price-kind">当前规格参考采购价</span>
      {product.skus.length > 0 && (
        <fieldset className="sku-picker">
          <legend>选择规格</legend>
          {product.skus.map((item) => (
            <label
              key={item.sku_id}
              className={skuId === item.sku_id ? "chosen" : ""}
            >
              <input
                type="radio"
                name="product-sku"
                value={item.sku_id}
                checked={skuId === item.sku_id}
                onChange={() => setSkuId(item.sku_id)}
              />
              <span>{item.spec}</span>
              <small>
                {item.stock > 0 ? `目录库存 ${item.stock}` : "目录暂无库存"}
              </small>
            </label>
          ))}
        </fieldset>
      )}
      <div className="detail-specs">
        {sku && (
          <div>
            <span>规格编号</span>
            <span>{sku.sku_id}</span>
          </div>
        )}
        <div>
          <span>设备分类</span>
          <span>{product.category}</span>
        </div>
        <div>
          <span>原产地</span>
          <span>{product.origin_country || "未提供"}</span>
        </div>
        {(product.ships_to?.length ?? 0) > 0 && (
          <div>
            <span>供货地区</span>
            <span>{product.ships_to?.join(" / ")}</span>
          </div>
        )}
        {product.rating_summary && (
          <div>
            <span>评分样例</span>
            <span>
              ★ {product.rating_summary.average} ·{" "}
              {product.rating_summary.review_count} 条
            </span>
          </div>
        )}
      </div>
      {canShowLanded ? (
        <div className="landed-detail-panel">
          <strong>
            到手价 {money(landed.landed_total_major, landed.currency)}
          </strong>
          <span>
            小计 {money(landed.subtotal_major, landed.currency)} + 运输费{" "}
            {money(landed.freight_major, landed.currency)} + 其他费用{" "}
            {money(landed.tariff_major, landed.currency)}
          </span>
          <small>供货至 {landed.ship_to} · 对应当前默认规格报价</small>
        </div>
      ) : (
        <p className="drawer-note">
          {skuId !== product.default_sku_id
            ? "已更换规格，到手价需重新查询。"
            : landed?.unavailable_reason || "采购参考价待地区与规格确认。"}
        </p>
      )}
      <p className="drawer-note">
        价格、库存为合成目录查询结果，采购前需要再次核对。图片与评分如标注为示意或样例，不代表真实厂商信息。
      </p>
      <button
        className="primary-button"
        disabled={busy}
        onClick={() => {
          onAsk(
            `请进一步核对「${product.title}」（product_id=${product.product_id}${sku ? `，sku_id=${sku.sku_id}，规格=${sku.spec}` : ""}）的当前库存与采购参考价。`,
          );
          onClose();
        }}
      >
        <Icon name="chat" />
        {busy ? "正在处理上一条需求" : "帮我进一步确认这款"}
      </button>
      <button
        className="drawer-compare"
        disabled={busy || !sku || sku.stock <= 0}
        onClick={() => sku && onPrepare(product, sku.sku_id)}
      >
        生成采购意向
      </button>
      <button
        className="drawer-compare"
        onClick={() =>
          onCompare(
            sku
              ? {
                  ...product,
                  default_sku_id: sku.sku_id,
                  price_major: sku.price_major,
                  currency: sku.currency,
                  landed_price: canShowLanded ? landed : undefined,
                }
              : product,
          )
        }
      >
        <Icon name="compare" />
        用当前规格比较
      </button>
    </Modal>
  );
}
