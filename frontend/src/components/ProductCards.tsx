import { memo, useState } from "react";
import type { ProductCard } from "../types";
import Icon from "./Icon";
export function money(value: number, currency: string) {
  if (!Number.isFinite(value)) return "待确认";
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}
export function ProductImage({
  product,
  className = "",
}: {
  product: ProductCard;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // 图片只使用服务端目录来源，不按商品名或 ID 注入前端样例图。
  if (!product.image_url || failed)
    return (
      <div className={`image-placeholder ${className}`}>
        <Icon name="bag" />
        <span>{product.category || "设备详情"}</span>
        <small>暂未提供设备图片</small>
      </div>
    );
  return (
    <img
      className={className}
      src={product.image_url}
      alt={product.image_alt || product.title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
interface ProductCardsProps {
  products: ProductCard[];
  favoriteIds: Set<string>;
  comparedIds: Set<string>;
  onFavorite: (product: ProductCard) => void;
  onCompare: (product: ProductCard) => void;
  onDetail: (product: ProductCard) => void;
}
function ProductCards({
  products,
  favoriteIds,
  comparedIds,
  onFavorite,
  onCompare,
  onDetail,
}: ProductCardsProps) {
  return (
    <div className="product-grid">
      {products.map((product, index) => {
        const saved = favoriteIds.has(product.product_id),
          selected = comparedIds.has(product.product_id),
          rating = product.rating_summary;
        const primary = product.skus.find(
            (sku) => sku.sku_id === product.default_sku_id,
          ),
          landed = product.landed_price;
        return (
          <article
            className={`product-card ${selected ? "selected" : ""}`}
            key={product.product_id}
            style={{ animationDelay: `${Math.min(index, 5) * 55}ms` }}
          >
            <div className="product-visual">
              <button
                className="image-open"
                onClick={() => onDetail(product)}
                aria-label={`查看 ${product.title} 详情`}
              >
                <ProductImage product={product} />
              </button>
              <span className="product-badge">{product.category}</span>
              <button
                className={`heart ${saved ? "saved" : ""}`}
                onClick={() => onFavorite(product)}
                aria-label={`${saved ? "取消收藏" : "收藏"} ${product.title}`}
                aria-pressed={saved}
              >
                <Icon name="heart" />
              </button>
              <span className="visual-caption">
                {product.image_kind === "illustration"
                  ? "设备示意图 · 非实物照片"
                  : "设备图片待补充"}
              </span>
            </div>
            <div className="product-body">
              <div className="product-topline">
                <span>{product.brand || "候选设备"}</span>
                {rating && (
                  <span className="rating">
                    <i>★</i> {rating.average.toFixed(1)}{" "}
                    <span>({rating.review_count} · 样例)</span>
                  </span>
                )}
              </div>
              <button
                className="product-title"
                onClick={() => onDetail(product)}
              >
                {product.title}
              </button>
              <div className="product-subtitle">
                {primary?.spec || product.highlights[0] || "查看设备详细信息"}
              </div>
              <div className="product-price-row">
                <div className="price">
                  {money(product.price_major, product.currency)}
                </div>
                <span className="price-kind">参考采购价</span>
              </div>
              {landed &&
              !landed.unavailable_reason &&
              Number.isFinite(landed.landed_total_major) ? (
                <div className="card-landed">
                  到手价 {money(landed.landed_total_major, landed.currency)}
                  <span>供货至 {landed.ship_to} · 默认规格</span>
                </div>
              ) : (
                <div className="card-landed pending">
                  采购参考价待地区与规格确认
                </div>
              )}
              <div className="product-footer">
                <label className="compare-check">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onCompare(product)}
                    aria-label={`将 ${product.title} 加入比较`}
                  />
                  加入比较
                </label>
                <button
                  className="detail-button"
                  onClick={() => onDetail(product)}
                >
                  看看细节
                  <Icon name="arrow" />
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// 商品引用与交互回调不变时，不随助手逐字输出重绘商品区域。
export default memo(ProductCards);
