import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommerceAgent } from "./hooks/useCommerceAgent";
import { readProducts } from "./lib/commerceClient";
import type { ProductCard, PublishedSkill } from "./types";
import Icon from "./components/Icon";
import Markdown from "./components/Markdown";
import EventTimeline from "./components/EventTimeline";
import ProductCards, { ProductImage } from "./components/ProductCards";
import ProductDetail from "./components/ProductDetail";
import ConfirmationCards from "./components/ConfirmationCards";
import OrderIntentForm from "./components/OrderIntentForm";
import ProductComparison from "./components/ProductComparison";
import ShoppingPlans, { SkillRunStatus } from "./components/ShoppingPlans";
import SkillQueryInput from "./components/SkillQueryInput";
import BuyerWorkspace from "./components/BuyerWorkspace";
import { skillQueryDraft, submitSkillQuery } from "./lib/skills";

type View = "shopping" | "history" | "favorites" | "skills" | "preferences";
const STARTERS = [
  "预算5000元，为流水线缺陷检测选择一款全局快门工业相机。",
  "选择支持Modbus TCP的边缘控制器，要求至少8路数字量输入。",
  "比较适合机械臂定位的视觉传感器，优先考虑精度和响应速度。",
];
const VIEW_KEY = "globex.workspace.view";
function readView(): View {
  try {
    const saved = sessionStorage.getItem(VIEW_KEY);
    if (saved && ["shopping", "history", "favorites", "skills", "preferences"].includes(saved))
      return saved as View;
  } catch { /* 存储受限时使用首页。 */ }
  return "shopping";
}
const FAVORITES_KEY = "globex.favorites.v1";
function readFavorites(): ProductCard[] {
  try {
    const data: unknown = JSON.parse(
      localStorage.getItem(FAVORITES_KEY) || "[]",
    );
    return readProducts(data).slice(0, 100);
  } catch {
    return [];
  }
}

export default function App() {
  const agent = useCommerceAgent();
  const [selectedSkill, setSelectedSkill] = useState<PublishedSkill | null>(null);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [view, setView] = useState<View>(readView),
    [input, setInput] = useState("");
  const [favorites, setFavorites] = useState<ProductCard[]>(readFavorites),
    [compared, setCompared] = useState<ProductCard[]>([]);
  const [detail, setDetail] = useState<ProductCard | null>(null),
    [showCompare, setShowCompare] = useState(false),
    [toast, setToast] = useState("");
  const [orderIntent, setOrderIntent] = useState<{
    product: ProductCard;
    skuId: string;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    bottomRef = useRef<HTMLDivElement>(null),
    autoScroll = useRef(true),
    programmaticScroll = useRef(false);
  useEffect(() => {
    try { sessionStorage.setItem(VIEW_KEY, view); } catch {}
  }, [view]);
  const busy = agent.status === "running";
  const favoriteIds = useMemo(
    () => new Set(favorites.map((p) => p.product_id)),
    [favorites],
  );
  const comparedIds = useMemo(
    () => new Set(compared.map((p) => p.product_id)),
    [compared],
  );
  const lastUser = [...agent.messages]
    .reverse()
    .find((message) => message.role === "user");
  const landedDestination = agent.products.find(
    (product) => product.landed_price?.ship_to,
  )?.landed_price?.ship_to;

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      setToast("浏览器暂时无法保存候选设备，本次使用仍可继续。 ");
    }
  }, [favorites]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setCompared([]);
    setSelectedSkill(null);
    setPlanPickerOpen(false);
    setInput("");
    setDetail(null);
    setOrderIntent(null);
    setShowCompare(false);
  }, [agent.sessionId]);
  useEffect(() => {
    if (selectedSkill && agent.skillsStatus === "ready" && !agent.skills.some((skill) => skill.id === selectedSkill.id
      && skill.version === selectedSkill.version && skill.content_hash === selectedSkill.content_hash)) {
      setSelectedSkill(null);
      setToast("这份方案已更新或暂不可用，已恢复为直接提问。 ");
    }
  }, [agent.skills, agent.skillsStatus, selectedSkill]);
  useEffect(() => {
    let previousY = window.scrollY;
    const onScroll = () => {
      const currentY = window.scrollY;
      const distance =
        document.documentElement.scrollHeight - currentY - window.innerHeight;
      if (!programmaticScroll.current) {
        // 用户向上查看历史即暂停跟随，不要求先滚出某个距离。
        if (currentY < previousY - 1 || distance > 240)
          autoScroll.current = false;
        else if (currentY > previousY && distance < 28)
          autoScroll.current = true;
      }
      previousY = currentY;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) autoScroll.current = false;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);
  useEffect(() => {
    if (
      view !== "shopping" ||
      detail ||
      showCompare ||
      !autoScroll.current ||
      !agent.messages.length
    )
      return;
    let releaseFrame = 0;
    const frame = requestAnimationFrame(() => {
      if (!autoScroll.current) return;
      programmaticScroll.current = true;
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
      releaseFrame = requestAnimationFrame(() => {
        programmaticScroll.current = false;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(releaseFrame);
      programmaticScroll.current = false;
    };
  }, [agent.messages, agent.products, view, detail, showCompare]);

  const submit = useCallback(
    (query: string, selection: PublishedSkill | null = null) => {
      if (!query.trim() || busy) return;
      submitSkillQuery(query, selection, (request, selected) => {
        setView("shopping");
        setInput("");
        setSelectedSkill(null);
        setPlanPickerOpen(false);
        setCompared([]);
        setShowCompare(false);
        autoScroll.current = true;
        void agent.submit(request, selected);
      }, (request) => {
        setView("shopping");
        setInput(request);
        setSelectedSkill(null);
        setPlanPickerOpen(false);
        setToast("这份方案已过期，已保留你的需求。请确认后再发送。 ");
        void agent.refreshSkills();
        inputRef.current?.focus();
      });
    },
    [agent.submit, agent.refreshSkills, busy],
  );
  const chooseSkill = (skill: PublishedSkill, draft = input) => {
    if (busy) return;
    if (skill.expires_at && Date.parse(skill.expires_at) <= Date.now()) {
      setToast("这份方案已过期，正在刷新可用方案。 ");
      void agent.refreshSkills();
      return;
    }
    const nextInput = skillQueryDraft(draft);
    if (nextInput.length > 4000) {
      setToast("需求较长，请稍作精简后再选择方案。 ");
      return;
    }
    setInput(nextInput);
    setSelectedSkill(skill);
    setPlanPickerOpen(false);
    setView("shopping");
    inputRef.current?.focus();
  };
  const cancelSkill = () => {
    setSelectedSkill(null);
    inputRef.current?.focus();
  };
  const planProps = { skills: agent.skills, status: agent.skillsStatus, error: agent.skillsError,
    selected: selectedSkill, disabled: busy, onSelect: chooseSkill, onRefresh: agent.refreshSkills };

  const newShopping = () => {
    agent.reset();
    setView("shopping");
    setInput("");
    autoScroll.current = true;
    window.scrollTo({ top: 0 });
    inputRef.current?.focus();
  };
  const openSession = (id: string) => {
    agent.setSession(id);
    setView("shopping");
    window.scrollTo({ top: 0 });
  };
  const switchView = (next: View) => {
    setView(next);
    window.scrollTo({ top: 0 });
  };
  const toggleFavorite = useCallback(
    (product: ProductCard) => {
      if (favoriteIds.has(product.product_id)) {
        setFavorites((current) =>
          current.filter((item) => item.product_id !== product.product_id),
        );
        setToast("已从候选设备移除。");
      } else {
        setFavorites((current) => [product, ...current].slice(0, 100));
        setToast("已收好，喜欢的可以慢慢选。 ");
      }
    },
    [favoriteIds],
  );
  const toggleCompare = useCallback(
    (product: ProductCard) => {
      if (comparedIds.has(product.product_id))
        setCompared((current) =>
          current.filter((item) => item.product_id !== product.product_id),
        );
      else if (compared.length >= 3)
        setToast("一次可以比较 3 台设备，先移出一台再试试。 ");
      else setCompared((current) => [...current, product]);
    },
    [comparedIds, compared.length],
  );
  const upsertCompare = useCallback(
    (product: ProductCard) => {
      if (!comparedIds.has(product.product_id) && compared.length >= 3) {
        setToast("一次可以比较 3 台设备，先移出一台再试试。 ");
        return;
      }
      // 详情选择规格是新增或更新；只有商品卡复选框负责移除比较。
      setCompared((current) =>
        current.some((item) => item.product_id === product.product_id)
          ? current.map((item) =>
              item.product_id === product.product_id ? product : item,
            )
          : current.length < 3
            ? [...current, product]
            : current,
      );
      setToast("已按当前所选规格更新比较信息。 ");
    },
    [comparedIds, compared.length],
  );
  const renderCards = (products: ProductCard[]) => (
    <ProductCards
      products={products}
      favoriteIds={favoriteIds}
      comparedIds={comparedIds}
      onFavorite={toggleFavorite}
      onCompare={toggleCompare}
      onDetail={setDetail}
    />
  );
  const navItems: { id: View; label: string; icon: string }[] = [
    { id: "shopping", label: "设备选型", icon: "bag" },
    { id: "history", label: "对话历史", icon: "chat" },
    { id: "favorites", label: "候选设备", icon: "heart" },
    { id: "skills", label: "我的 Skill", icon: "leaf" },
    { id: "preferences", label: "长期偏好", icon: "spark" },
  ];

  return (
    <>
      <aside className="sidebar" aria-label="主导航">
        <button
          className="brand"
          onClick={() => switchView("shopping")}
          aria-label="EquipForge 智能装备选型首页"
        >
          <Icon name="globe" className="brand-mark" />
          <span>
            <span className="brand-name">EquipForge</span>
            <span className="brand-subtitle">智能装备选型</span>
          </span>
        </button>
        <button className="new-chat" onClick={newShopping} disabled={busy}>
          <Icon name="plus" />
          开启一次新选型
        </button>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => switchView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.id === "favorites" && (
                <span className="nav-count">{favorites.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label">最近选型</div>
        {agent.history.slice(0, 4).map((item) => (
          <button
            className="history-short"
            key={item.id}
            onClick={() => openSession(item.id)}
            disabled={busy}
            title={item.title}
          >
            {item.title}
          </button>
        ))}
        {!agent.history.length && (
          <p className="sidebar-empty">第一段设备选型，等你开启。</p>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="globe" className="little-orbit" />
            <p>
              工业场景各有不同，
              <br />
              参数匹配，决策有据。
            </p>
          </div>
          <div className="profile">
            <span className="avatar">工</span>
            <span>
              <span className="profile-name">装备选型工程师</span>
              <span className="profile-caption">让每一次决策都有依据</span>
            </span>
            <Icon name="leaf" />
          </div>
        </div>
      </aside>
      <main>
        <div className="content">
          <header className="topbar">
            <div className="breadcrumb">
              <span>智能装备选型</span>
              <span>／</span>
              <span>
                {view === "skills" ? "我的 Skill" : view === "preferences" ? "长期偏好" : view === "history"
                  ? "设备选型历史"
                  : view === "favorites"
                    ? "候选设备"
                    : "辅助决策"}
              </span>
            </div>
            <button
              className="mobile-brand"
              onClick={() => switchView("shopping")}
            >
              <Icon name="globe" />
              EquipForge
            </button>
            <div className="location">
              <Icon name="pin" />
              {landedDestination
                ? `供货至 ${landedDestination}`
                : "参数匹配，辅助决策"}
            </div>
          </header>
          <nav className="mobile-nav" aria-label="移动导航">
            <button onClick={newShopping} disabled={busy}>
              新选型
            </button>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => switchView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {(view === "skills" || view === "preferences") && <BuyerWorkspace key={view} mode={view} busy={busy}
            request={agent.workspaceRequest} onSkillsChanged={agent.refreshSkills} />}
          {view === "shopping" && (
            <>
              <section className="hero">
                <div className="eyebrow">ENGINEERED FOR BETTER DECISIONS</div>
                <h1>
                  面向真实工况，<em>选对智能装备。</em>
                </h1>
                <p>描述应用场景、预算与关键参数，EquipForge 为你检索、比较并生成选型建议。</p>
              </section>
              {!agent.messages.length ? (
                <section className="welcome-panel">
                  <Icon name="globe" className="welcome-orbit" />
                  <h2>这一次，要解决什么工程问题？</h2>
                  <p>从应用工况、性能指标或采购预算开始。</p>
                  <div className="welcome-ideas">
                    <button onClick={() => submit(STARTERS[0])}>
                      流水线缺陷检测工业相机
                      <Icon name="arrow" />
                    </button>
                    <button onClick={() => submit(STARTERS[1])}>
                      Modbus TCP 边缘控制器
                      <Icon name="arrow" />
                    </button>
                    <button onClick={() => submit(STARTERS[2])}>
                      机械臂定位视觉传感器
                      <Icon name="arrow" />
                    </button>
                  </div>
                  <span className="welcome-caption">
                    每一份推荐，都从你的实际需求开始。
                  </span>
                </section>
              ) : (
                <section className="conversation" aria-label="设备选型对话">
                  {agent.messages.map((message, index) =>
                    message.role === "user" ? (
                      <div className="query-row" key={message.id}>
                        <div className="query-bubble">{message.content}</div>
                      </div>
                    ) : (
                      <div className="assistant-row" key={message.id}>
                        <div className="assistant-mark">
                          <Icon name="spark" />
                        </div>
                        <div
                          className={`assistant-text ${busy && index === agent.messages.length - 1 ? "typing" : ""}`}
                        >
                          <Markdown
                            content={message.content}
                            streaming={
                              busy && index === agent.messages.length - 1
                            }
                          />
                        </div>
                      </div>
                    ),
                  )}
                </section>
              )}
              {!agent.messages.length && <ShoppingPlans {...planProps} />}
              <SkillRunStatus usages={agent.skillUsages} running={busy} />
              {busy && (
                <div className="progress-line running" role="status">
                  <span className="live-dot" />
                  <span>{agent.step || "正在为你整理合适的选择…"}</span>
                </div>
              )}
              {agent.status === "stopped" && (
                <div className="progress-line stopped" role="status">
                  <Icon name="stop" />
                  <span>
                    {agent.recoverableRunId ? "停止请求已发送，正在等待服务端确认。已有内容已保留。" : "已停止本次回复。已有内容为你保留，可以继续补充需求。"}
                  </span>
                </div>
              )}
              {agent.error && (
                <div className="error-panel" role="alert">
                  <Icon name="info" />
                  <div>
                    <strong>暂时没能完成这次选型</strong>
                    <p>{agent.error}</p>
                  </div>
                  {agent.recoverableRunId ? (
                    <>
                      <button disabled={busy} onClick={() => void agent.resume()}>恢复本轮</button>
                      <button disabled={busy} onClick={agent.stop}>停止本轮</button>
                    </>
                  ) : lastUser && (
                    <button
                      disabled={busy}
                      onClick={() => submit(lastUser.content)}
                    >
                      再试一次
                    </button>
                  )}
                </div>
              )}
              {(agent.confirmations.length > 0 || agent.confirmationError) && (
                <ConfirmationCards
                  confirmations={agent.confirmations}
                  busy={agent.confirmationBusy || busy}
                  error={agent.confirmationError}
                  onResolve={agent.resolveConfirmation}
                  onCancelOrder={agent.prepareCancel}
                  onRefresh={agent.refreshConfirmations}
                />
              )}
              {agent.products.length > 0 && (
                <section className="search-results" aria-label="设备搜索结果">
                  <div className="results-heading">
                    <div className="results-label">
                      <strong>这次找到的候选设备</strong> · {agent.products.length}{" "}
                      台
                    </div>
                    <button
                      className="results-action"
                      onClick={() =>
                        setToast(
                          "勾选设备卡下方的“加入比较”，可并排比较 2 至 3 台设备。 ",
                        )
                      }
                    >
                      <Icon name="compare" />
                      勾选设备，参数对比
                    </button>
                  </div>
                  {renderCards(agent.products)}
                  <div className="results-footnote">
                    <Icon name="info" />
                    <span>
                      结果来自合成设备目录。示意图与样例评分均已标注，价格与供货信息以具体规格为准。
                    </span>
                  </div>
                </section>
              )}
              {!busy &&
                agent.searchCompleted &&
                !agent.products.length &&
                !agent.error && (
                  <section className="empty-state search-empty">
                    <Icon name="bag" />
                    <h2>
                      {agent.status === "stopped"
                        ? "先停在这里，也没关系"
                        : "这次，还没有合适的结果"}
                    </h2>
                    <p>
                      {agent.status === "stopped"
                        ? "本轮已停止，尚未收到设备结果。调整需求后可以重新开始。"
                        : "这次检索没有返回符合条件的设备。可以调整预算、类别或关键参数，再一起看看。"}
                    </p>
                    <button
                      onClick={() => {
                        setInput(lastUser?.content || "");
                        inputRef.current?.focus();
                      }}
                    >
                      调整一下需求
                      <Icon name="arrow" />
                    </button>
                  </section>
                )}
              {busy && !agent.products.length && (
                <div
                  className="product-grid loading-results"
                  aria-label="正在查找设备"
                >
                  <div className="loading-card" />
                  <div className="loading-card" />
                  <div className="loading-card" />
                </div>
              )}
              {agent.messages.length > 0 && (
                <div className="suggestions">
                  <button
                    className="suggestion"
                    disabled={busy}
                    onClick={() => {
                      setInput("预算想再少一点，");
                      inputRef.current?.focus();
                    }}
                  >
                    调整预算
                    <Icon name="arrow" />
                  </button>
                  {agent.products.length > 1 && (
                    <button
                      className="suggestion"
                      onClick={() => {
                        setCompared(agent.products.slice(0, 3));
                        setShowCompare(true);
                      }}
                    >
                      一起比较看看
                      <Icon name="compare" />
                    </button>
                  )}
                  <button
                    className="suggestion"
                    onClick={() => switchView("favorites")}
                  >
                    查看候选设备
                    <Icon name="heart" />
                  </button>
                </div>
              )}
              <EventTimeline events={agent.events} skillUsages={agent.skillUsages} running={busy} />
              <div ref={bottomRef} className="scroll-anchor" />
            </>
          )}
          {view === "favorites" && (
            <>
              <h1 className="library-title">候选设备，集中比较。</h1>
              <p className="library-description">
                候选设备保存在本机浏览器。以下是上次查看的设备信息，价格与库存请重新查询确认。
              </p>
              {favorites.length ? (
                renderCards(favorites)
              ) : (
                <section className="empty-state">
                  <Icon name="heart" />
                  <h2>等待第一台候选设备</h2>
                  <p>点击设备右上角的收藏按钮，就能将它加入候选清单。</p>
                  <button onClick={() => switchView("shopping")}>
                    去选择设备
                    <Icon name="arrow" />
                  </button>
                </section>
              )}
            </>
          )}
          {view === "history" && (
            <>
              <h1 className="library-title">每一次期待，都有迹可循。</h1>
              <p className="library-description">
                同一用户身份的选型记录由服务端保存，断线后可恢复。浏览器另保留最近 12 段缓存；本机候选设备与身份信息仍需自行保留。
              </p>
              {agent.historyError && <p role="status">{agent.historyError}</p>}
              <div className="history-list">
                {agent.history.length ? (
                  agent.history.map((item) => (
                    <button
                      key={item.id}
                      className="history-entry"
                      onClick={() => openSession(item.id)}
                      disabled={busy}
                    >
                      <span className="history-icon">
                        <Icon name="chat" />
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {new Date(item.updatedAt).toLocaleString("zh-CN")}
                          {item.id === agent.sessionId ? " · 当前选型" : ""}
                        </small>
                      </span>
                      <Icon name="arrow" />
                    </button>
                  ))
                ) : (
                  <section className="empty-state">
                    <Icon name="chat" />
                    <h2>从第一次设备选型开始</h2>
                    <p>你和 EquipForge 的每次交流，都会为下一次工程决策留下线索。</p>
                    <button onClick={newShopping}>
                      开启新的选型
                      <Icon name="arrow" />
                    </button>
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      {view !== "skills" && view !== "preferences" && <div className="composer-dock">
        <div className="composer-wrap">
          {compared.length > 0 && (
            <div className="compare-bar">
              <div className="compare-mini">
                {compared.map((p) => (
                  <ProductImage product={p} key={p.product_id} />
                ))}
              </div>
              <span>
                已选 {compared.length} 件
                {compared.length === 1 ? "，再选一件比比看" : ""}
              </span>
              <button
                className="compare-go"
                onClick={() => setShowCompare(true)}
                disabled={compared.length < 2}
              >
                开始比较
                <Icon name="arrow" />
              </button>
              <button className="compare-clear" onClick={() => setCompared([])}>
                清空
              </button>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) agent.stop();
              else if (!slashMenuOpen) submit(input, selectedSkill);
            }}
          >
            <div className="composer-plan-controls">
              <button type="button" className="plan-picker-toggle" aria-expanded={planPickerOpen} aria-controls="composer-plans"
                disabled={busy} onClick={() => setPlanPickerOpen(!planPickerOpen)}><Icon name="leaf" />选型方案</button>
              {selectedSkill ? <div className="selected-plan"><span>已选择 · {selectedSkill.title}</span>
                <button type="button" aria-label="取消已选方案" disabled={busy} onClick={cancelSkill}><Icon name="close" /></button></div>
                : <span className="plan-automatic">直接提问 · 自动匹配</span>}
            </div>
            {planPickerOpen && <div className="plan-picker-panel" id="composer-plans" onKeyDown={(event) => { if (event.key === "Escape") { setPlanPickerOpen(false); inputRef.current?.focus(); } }}>
              <ShoppingPlans {...planProps} compact />
            </div>}
            <label htmlFor="query" className="sr-only">
              告诉 EquipForge 你的装备需求
            </label>
            <SkillQueryInput
              key={agent.sessionId}
              ref={inputRef}
              value={input}
              skills={agent.skills}
              status={agent.skillsStatus}
              error={agent.skillsError}
              busy={busy}
              onChange={setInput}
              onSelect={chooseSkill}
              onSubmit={() => submit(input, selectedSkill)}
              onRefresh={agent.refreshSkills}
              onMenuOpenChange={setSlashMenuOpen}
            />
            <div className="composer-bottom">
              <span className="composer-hint">
                <Icon name="spark" />
                告诉我应用工况、预算与关键参数
              </span>
              <button
                type="submit"
                className={`send-button ${busy ? "stop" : ""}`}
                disabled={!busy && (!input.trim() || slashMenuOpen)}
                aria-label={busy ? "停止生成" : "发送选型需求"}
              >
                <Icon name={busy ? "stop" : "up"} />
                {busy && <span>停止</span>}
              </button>
            </div>
          </form>
          <footer className="preview-footer">
            <span>EquipForge 智能装备选型</span>
            <span>·</span>
            <span>参数可比，决策有据</span>
          </footer>
        </div>
      </div>}
      {detail && (
        <ProductDetail
          key={detail.product_id}
          product={detail}
          busy={busy}
          onClose={() => setDetail(null)}
          onCompare={upsertCompare}
          onAsk={submit}
          onPrepare={(product, skuId) => {
            setDetail(null);
            setOrderIntent({ product, skuId });
          }}
        />
      )}
      {orderIntent && (
        <OrderIntentForm
          product={orderIntent.product}
          skuId={orderIntent.skuId}
          busy={agent.confirmationBusy}
          error={agent.confirmationError}
          onClose={() => setOrderIntent(null)}
          onPrepare={async (input) => {
            const success = await agent.prepareOrder(input);
            if (success) {
              setView("shopping");
              setToast("确认单已准备好，请核对后决定。");
            }
            return success;
          }}
        />
      )}
      {showCompare && compared.length >= 2 && (
        <ProductComparison
          products={compared}
          onClose={() => setShowCompare(false)}
        />
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status">
        {toast}
      </div>
    </>
  );
}
