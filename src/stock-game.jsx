import { useState, useEffect, useRef, useCallback } from "react";

const STARTING_CASH = 10000;
const STOCKS_DEF = [
  { id: "samsung", name: "삼성전자", ticker: "005930", basePrice: 680, sector: "반도체" },
  { id: "kakao",   name: "카카오",   ticker: "035720", basePrice: 420,  sector: "IT" },
  { id: "hyundai", name: "현대차",   ticker: "005380", basePrice: 1850, sector: "자동차" },
  { id: "naver",   name: "NAVER",    ticker: "035420", basePrice: 2100, sector: "IT" },
  { id: "skhynix", name: "SK하이닉스", ticker: "000660", basePrice: 1950, sector: "반도체" },
  { id: "lgen",    name: "LG에너지솔루션", ticker: "373220", basePrice: 3500, sector: "배터리" },
  { id: "celltrion", name: "셀트리온", ticker: "068270", basePrice: 890, sector: "바이오" },
  { id: "posco",   name: "POSCO홀딩스", ticker: "005490", basePrice: 560, sector: "철강" },
];

const initStock = (s) => ({
  ...s, price: s.basePrice, prevPrice: s.basePrice, open: s.basePrice,
  high: s.basePrice, low: s.basePrice, change: 0, changePct: 0,
  history: Array(24).fill(s.basePrice), earnings: null,
});

const fmt   = (n) => Math.round(n ?? 0).toLocaleString("ko-KR");
const fmtPct= (n) => (n >= 0 ? "+" : "") + (n ?? 0).toFixed(2) + "%";
const upClr = "#ff3d5a";   // Korean convention: red = up
const dnClr = "#4d9dff";   // blue = down
const clr   = (n) => n > 0 ? upClr : n < 0 ? dnClr : "#6a7d9a";

function Sparkline({ history, color, w = 64, h = 26 }) {
  if (!history || history.length < 2) return null;
  const min = Math.min(...history), max = Math.max(...history);
  const rng = max - min || 1;
  const pts = history.map((v, i) =>
    `${(i / (history.length - 1)) * w},${h - ((v - min) / rng) * (h - 2) - 1}`
  ).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}

function MiniChart({ history, color }) {
  return <Sparkline history={history} color={color} w={200} h={64} />;
}

export default function StockGame() {
  // ── CSS injection ──────────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      *{box-sizing:border-box;margin:0;padding:0}
      html,body{height:100%;background:#060d1f}
      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-track{background:#050b18}
      ::-webkit-scrollbar-thumb{background:#1a2a4a;border-radius:2px}
      @keyframes flash-red{0%{background:rgba(255,61,90,.18)}100%{background:transparent}}
      @keyframes flash-blue{0%{background:rgba(77,157,255,.18)}100%{background:transparent}}
      @keyframes fadeUp{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
      .flash-r{animation:flash-red .7s ease-out}
      .flash-b{animation:flash-blue .7s ease-out}
      .fade-up{animation:fadeUp .3s ease-out}
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(link); document.head.removeChild(style); };
  }, []);

  // ── State ──────────────────────────────────────────────────────────────
  const [screen,     setScreen]     = useState("login");
  const [inputName,  setInputName]  = useState("");
  const [username,   setUsername]   = useState("");
  const [cash,       setCash]       = useState(STARTING_CASH);
  const [holdings,   setHoldings]   = useState({});
  const [stocks,     setStocks]     = useState(() => STOCKS_DEF.map(initStock));
  const [activeTab,  setActiveTab]  = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [news,       setNews]       = useState([]);
  const [rankings,   setRankings]   = useState([]);
  const [orderQty,   setOrderQty]   = useState(1);
  const [newsLoading,setNewsLoading]= useState(false);
  const [flashMap,   setFlashMap]   = useState({});

  const generatingRef = useRef(false);

  const selectedStock = stocks.find(s => s.id === selectedId) || null;
  const heldQty       = selectedId ? (holdings[selectedId] || 0) : 0;
  const stockValue    = Math.round(stocks.reduce((a, s) => a + (holdings[s.id] || 0) * s.price, 0));
  const totalAsset    = Math.round(cash + stockValue);
  const profit        = totalAsset - STARTING_CASH;

  // ── Price tick ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "app") return;
    const tick = setInterval(() => {
      const flashes = {};
      setStocks(prev => prev.map(s => {
        const drift = (Math.random() - 0.485) * 0.028;
        const noise = (Math.random() - 0.5)  * 0.012;
        const newPrice  = Math.max(10, Math.round(s.price * (1 + drift + noise)));
        const changePct = ((newPrice - s.open) / s.open) * 100;
        if (newPrice !== s.price) flashes[s.id] = newPrice > s.price ? "r" : "b";
        return { ...s, prevPrice: s.price, price: newPrice,
          high: Math.max(s.high, newPrice), low: Math.min(s.low, newPrice),
          change: newPrice - s.open, changePct,
          history: [...s.history.slice(-49), newPrice] };
      }));
      setFlashMap(flashes);
      setTimeout(() => setFlashMap({}), 750);
    }, 4500);
    return () => clearInterval(tick);
  }, [screen]);

  // ── AI News ────────────────────────────────────────────────────────────
  const generateNews = useCallback(async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setNewsLoading(true);
    try {
      const ids = STOCKS_DEF.map(s => `${s.name}→id:${s.id}`).join(", ");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 600,
          messages: [{ role: "user", content:
            `주식 모의투자 게임용 한국 주식 뉴스를 생성해주세요. 대상 종목: ${ids}
JSON 배열만 출력(마크다운 없이):
[{"headline":"짧은 뉴스","stockId":"id값","effect":0.07,"type":"실적|M&A|규제|시장|기술"}]
- 2~3개, effect: -0.15~+0.15, 뉴스는 현실적이고 다양하게` }]
        })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "[]";
      const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());
      const t = new Date().toTimeString().slice(0, 5);
      const items = parsed.map((n, i) => ({ ...n, time: t, id: Date.now() + i }));
      setNews(prev => [...items, ...prev].slice(0, 40));
      setStocks(prev => prev.map(s => {
        const hit = items.find(n => n.stockId === s.id);
        if (!hit) return s;
        const newPrice  = Math.max(10, Math.round(s.price * (1 + hit.effect)));
        const changePct = ((newPrice - s.open) / s.open) * 100;
        return { ...s, prevPrice: s.price, price: newPrice,
          high: Math.max(s.high, newPrice), low: Math.min(s.low, newPrice),
          change: newPrice - s.open, changePct,
          history: [...s.history.slice(-49), newPrice],
          earnings: hit.type === "실적"
            ? { q: "2025 Q1", surprise: hit.effect > 0 ? "서프라이즈 🎉" : "쇼크 💥" }
            : s.earnings };
      }));
    } catch {
      const t = new Date().toTimeString().slice(0, 5);
      setNews(prev => [
        { headline: "미 연준 금리 동결로 코스피 안도 랠리", stockId: "samsung", effect: 0.04, type: "시장", time: t, id: Date.now() },
        { headline: "반도체 수출 규제 우려 확산", stockId: "skhynix", effect: -0.05, type: "규제", time: t, id: Date.now()+1 },
        ...prev
      ].slice(0, 40));
    } finally {
      generatingRef.current = false;
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen !== "app") return;
    const timer = setTimeout(generateNews, 1800);
    const iv    = setInterval(generateNews, 45000);
    return () => { clearTimeout(timer); clearInterval(iv); };
  }, [screen, generateNews]);

  // ── Rankings ───────────────────────────────────────────────────────────
  const saveRanking = async (name, asset) => {
    try { await window.storage.set(`rk:${name}`, JSON.stringify({ name, asset, ts: Date.now() }), true); }
    catch {}
  };
  const loadRankings = async () => {
    try {
      const res = await window.storage.list("rk:", true);
      if (!res?.keys?.length) return;
      const rows = (await Promise.all(res.keys.map(async k => {
        try { const r = await window.storage.get(k, true); return r ? JSON.parse(r.value) : null; }
        catch { return null; }
      }))).filter(Boolean);
      setRankings(rows.sort((a, b) => b.asset - a.asset).slice(0, 20));
    } catch {}
  };
  useEffect(() => {
    if (!username || screen !== "app") return;
    saveRanking(username, totalAsset);
    loadRankings();
    const iv = setInterval(() => { saveRanking(username, totalAsset); loadRankings(); }, 18000);
    return () => clearInterval(iv);
  }, [username, totalAsset, screen]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleStart = () => {
    const n = inputName.trim(); if (!n) return;
    setUsername(n); setScreen("app");
  };

  const buy = () => {
    if (!selectedStock || orderQty <= 0) return;
    const cost = selectedStock.price * orderQty;
    if (cost > cash) return;
    setCash(c => c - cost);
    setHoldings(h => ({ ...h, [selectedId]: (h[selectedId] || 0) + orderQty }));
  };
  const sell = () => {
    if (!selectedStock) return;
    const qty = Math.min(orderQty, holdings[selectedId] || 0);
    if (qty <= 0) return;
    setCash(c => c + selectedStock.price * qty);
    setHoldings(h => ({ ...h, [selectedId]: (h[selectedId] || 0) - qty }));
  };
  const setByPct = (mode) => {
    if (!selectedStock) return;
    if (mode === "mb") { setOrderQty(Math.max(1, Math.floor(cash / selectedStock.price))); return; }
    if (mode === "ms") { setOrderQty(Math.max(1, holdings[selectedId] || 1));               return; }
    setOrderQty(Math.max(1, Math.floor(Math.floor(cash / selectedStock.price) * mode)));
  };

  // ── Styles ─────────────────────────────────────────────────────────────
  const C = {
    app:   { display:"flex", flexDirection:"column", height:"100vh", maxWidth:430, margin:"0 auto", background:"#060d1f", overflow:"hidden", fontFamily:"'Nanum Gothic',sans-serif", color:"#dde6f7" },
    hdr:   { padding:"12px 16px 10px", background:"linear-gradient(180deg,#0d1b3e,#060d1f)", borderBottom:"1px solid #182d50", flexShrink:0 },
    body:  { flex:1, overflowY:"auto", padding:"12px 14px 84px" },
    bnav:  { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"#080f20", borderTop:"1px solid #182d50", display:"flex", padding:"8px 0 env(safe-area-inset-bottom,12px)", zIndex:100 },
    card:  { background:"#0d1b3e", border:"1px solid #182d50", borderRadius:14, padding:"14px 16px", marginBottom:10 },
    row:   { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 0", borderBottom:"1px solid #0e2040", cursor:"pointer" },
    modal: { position:"fixed", inset:0, background:"#060d1f", zIndex:200, display:"flex", flexDirection:"column", maxWidth:430, margin:"0 auto" },
    mono:  { fontFamily:"'JetBrains Mono',monospace" },
    sBtn:  { background:"#0e2040", border:"none", borderRadius:8, padding:"7px 10px", color:"#7eb3ff", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" },
    inp:   { background:"#0d1b3e", border:"1px solid #182d50", borderRadius:12, padding:"14px 18px", fontSize:18, color:"#dde6f7", width:"100%", outline:"none", fontFamily:"'Nanum Gothic',sans-serif" },
  };
  const tradBtn = (bg) => ({ background:bg, border:"none", borderRadius:10, padding:"15px", fontSize:16, fontWeight:800, color:"#fff", flex:1, cursor:"pointer" });

  const heldStocks = stocks.filter(s => (holdings[s.id] || 0) > 0);

  // ── LOGIN ──────────────────────────────────────────────────────────────
  if (screen === "login") return (
    <div style={{ ...C.app, justifyContent:"center", alignItems:"center", padding:28 }}>
      <div style={{ fontSize:56, marginBottom:8 }}>📈</div>
      <div style={{ fontSize:30, fontWeight:800, color:"#fff", marginBottom:6 }}>주식고수!!!</div>
      <div style={{ fontSize:14, color:"#4a6080", marginBottom:44 }}>10,000원으로 시작하는 모의투자</div>
      <div style={{ width:"100%", maxWidth:360 }}>
        <input style={C.inp} placeholder="닉네임을 입력하세요" value={inputName}
          onChange={e => setInputName(e.target.value)} onKeyDown={e => e.key==="Enter" && handleStart()} maxLength={12} />
        <button onClick={handleStart} style={{ ...tradBtn("#ff3d5a"), width:"100%", borderRadius:12, padding:"16px", marginTop:12, fontSize:17 }}>
          🚀 시작하기
        </button>
        <div style={{ textAlign:"center", marginTop:14, color:"#4a6080", fontSize:12, lineHeight:1.6 }}>
          같은 닉네임으로 접속하면 랭킹이 유지됩니다
        </div>
      </div>
    </div>
  );

  // ── HOME TAB ───────────────────────────────────────────────────────────
  const HomeTab = () => (
    <>
      <div style={{ ...C.card, background:"linear-gradient(135deg,#0d1b3e,#0a2455)", borderColor:"#1e3a6e" }}>
        <div style={{ fontSize:12, color:"#4a6080", marginBottom:2 }}>총 자산</div>
        <div style={{ ...C.mono, fontSize:30, fontWeight:700, color:"#fff", marginBottom:8 }}>{fmt(totalAsset)}원</div>
        <div style={{ display:"flex", gap:20 }}>
          <div><div style={{ fontSize:11, color:"#4a6080" }}>보유 현금</div>
            <div style={{ ...C.mono, fontSize:15, color:"#7eb3ff" }}>{fmt(Math.round(cash))}원</div></div>
          <div><div style={{ fontSize:11, color:"#4a6080" }}>주식 평가액</div>
            <div style={{ ...C.mono, fontSize:15, color:"#7eb3ff" }}>{fmt(stockValue)}원</div></div>
          <div><div style={{ fontSize:11, color:"#4a6080" }}>총 손익</div>
            <div style={{ ...C.mono, fontSize:15, color:clr(profit) }}>{profit >= 0 ? "+" : ""}{fmt(profit)}원</div></div>
        </div>
      </div>

      <div style={{ fontSize:12, fontWeight:700, color:"#4a6080", marginBottom:8, paddingLeft:2 }}>보유 종목</div>
      <div style={C.card}>
        {heldStocks.length === 0
          ? <div style={{ textAlign:"center", color:"#4a6080", padding:"18px 0", fontSize:14 }}>보유 종목이 없습니다</div>
          : heldStocks.map((s, i) => (
            <div key={s.id} onClick={() => { setSelectedId(s.id); setOrderQty(1); }}
              style={{ ...C.row, borderBottom: i < heldStocks.length-1 ? "1px solid #0e2040" : "none" }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700 }}>{s.name}</div>
                <div style={{ fontSize:12, color:"#4a6080" }}>{holdings[s.id]}주 · {fmt(s.price * holdings[s.id])}원</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ ...C.mono, fontSize:15, fontWeight:700 }}>{fmt(s.price)}원</div>
                <div style={{ ...C.mono, fontSize:12, color:clr(s.changePct) }}>{fmtPct(s.changePct)}</div>
              </div>
            </div>
          ))
        }
      </div>

      <div style={{ fontSize:12, fontWeight:700, color:"#4a6080", margin:"12px 0 8px", paddingLeft:2 }}>📰 최신 뉴스</div>
      <div style={C.card}>
        {news.length === 0
          ? <div style={{ color:"#4a6080", padding:"14px 0", textAlign:"center", fontSize:14 }}>
              {newsLoading ? "📡 뉴스 수신 중..." : "뉴스를 기다리는 중..."}
            </div>
          : news.slice(0, 3).map(n => (
            <div key={n.id} style={{ padding:"9px 0", borderBottom:"1px solid #0e2040" }}>
              <div style={{ fontSize:13, lineHeight:1.5 }}>{n.headline}</div>
              <div style={{ fontSize:11, color:"#4a6080", marginTop:3 }}>{n.time} · {n.type}</div>
            </div>
          ))
        }
      </div>
    </>
  );

  // ── STOCKS TAB ─────────────────────────────────────────────────────────
  const StocksTab = () => (
    <div style={C.card}>
      {stocks.map((s, i) => {
        const fc = flashMap[s.id];
        return (
          <div key={s.id} onClick={() => { setSelectedId(s.id); setOrderQty(1); }}
            className={fc === "r" ? "flash-r" : fc === "b" ? "flash-b" : ""}
            style={{ ...C.row, borderBottom: i < stocks.length-1 ? "1px solid #0e2040" : "none", borderRadius:6, transition:"background .3s" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700 }}>{s.name}</div>
                <div style={{ fontSize:11, color:"#4a6080" }}>{s.ticker} · {s.sector}</div>
              </div>
              <Sparkline history={s.history} color={clr(s.changePct)} />
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ ...C.mono, fontSize:15, fontWeight:700, color: s.price !== s.prevPrice ? clr(s.price - s.prevPrice) : "#dde6f7" }}>
                {fmt(s.price)}원
              </div>
              <div style={{ ...C.mono, fontSize:12, color:clr(s.changePct) }}>{fmtPct(s.changePct)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── RANKING TAB ────────────────────────────────────────────────────────
  const RankingTab = () => (
    <>
      <div style={{ textAlign:"center", padding:"8px 0 16px", color:"#4a6080", fontSize:13 }}>🏆 전체 랭킹 (실시간)</div>
      <div style={C.card}>
        {rankings.length === 0
          ? <div style={{ textAlign:"center", color:"#4a6080", padding:"20px 0" }}>랭킹 로딩 중...</div>
          : rankings.map((r, i) => {
            const me = r.name === username;
            const medal = ["🥇","🥈","🥉"][i];
            const roi = ((r.asset - STARTING_CASH) / STARTING_CASH * 100).toFixed(1);
            return (
              <div key={r.name + i} style={{ display:"flex", alignItems:"center", padding:"10px 6px",
                borderBottom: i < rankings.length-1 ? "1px solid #0e2040" : "none",
                background: me ? "rgba(126,179,255,.06)" : "transparent", borderRadius:6 }}>
                <div style={{ ...C.mono, width:34, fontSize:17, color: medal ? "inherit" : "#4a6080" }}>
                  {medal || (i + 1)}
                </div>
                <div style={{ flex:1, fontSize:15, fontWeight: me ? 800 : 400, color: me ? "#7eb3ff" : "#dde6f7" }}>
                  {r.name}{me ? " 👈" : ""}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ ...C.mono, fontSize:14, fontWeight:700 }}>{fmt(r.asset)}원</div>
                  <div style={{ ...C.mono, fontSize:11, color:clr(r.asset - STARTING_CASH) }}>{roi > 0 ? "+" : ""}{roi}%</div>
                </div>
              </div>
            );
          })
        }
      </div>
      <div style={{ textAlign:"center", marginTop:8, color:"#4a6080", fontSize:12 }}>내 자산: {fmt(totalAsset)}원</div>
    </>
  );

  // ── NEWS TAB ───────────────────────────────────────────────────────────
  const NewsTab = () => (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#4a6080" }}>📰 뉴스 속보</div>
        <button onClick={generateNews} disabled={newsLoading}
          style={{ ...C.sBtn, opacity: newsLoading ? .5 : 1, fontSize:13, padding:"8px 14px" }}>
          {newsLoading ? "수신 중..." : "새로고침 ↻"}
        </button>
      </div>
      <div style={C.card}>
        {news.length === 0
          ? <div style={{ color:"#4a6080", textAlign:"center", padding:"20px 0" }}>뉴스를 기다리는 중...</div>
          : news.map(n => {
            const stock = stocks.find(s => s.id === n.stockId);
            return (
              <div key={n.id} style={{ padding:"12px 0", borderBottom:"1px solid #0e2040" }} className="fade-up">
                <div style={{ fontSize:14, lineHeight:1.5, marginBottom:5 }}>{n.headline}</div>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, color:"#4a6080" }}>{n.time}</span>
                  {stock && <span style={{ fontSize:11, background:"#0e2040", borderRadius:4, padding:"2px 7px", color:"#7eb3ff" }}>{stock.name}</span>}
                  <span style={{ fontSize:11, background:"#0e2040", borderRadius:4, padding:"2px 7px", color:"#a0b0c8" }}>{n.type}</span>
                  {n.effect !== undefined && (
                    <span style={{ fontSize:11, color:clr(n.effect), fontWeight:700 }}>
                      {n.effect > 0 ? "▲" : "▼"} {Math.abs((n.effect * 100).toFixed(1))}%
                    </span>
                  )}
                </div>
              </div>
            );
          })
        }
      </div>
    </>
  );

  const TABS = [
    { id:"home",    icon:"🏠", label:"홈" },
    { id:"stocks",  icon:"📊", label:"종목" },
    { id:"ranking", icon:"🏆", label:"랭킹" },
    { id:"news",    icon:"📰", label:"뉴스" },
  ];

  return (
    <div style={C.app}>
      {/* Header */}
      <div style={C.hdr}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:19, fontWeight:800 }}>📈 주식고수!!!</div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:11, color:"#4a6080" }}>{username}</div>
            <div style={{ ...C.mono, fontSize:16, fontWeight:700, color: clr(profit) }}>{fmt(totalAsset)}원</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={C.body}>
        {activeTab === "home"    && <HomeTab />}
        {activeTab === "stocks"  && <StocksTab />}
        {activeTab === "ranking" && <RankingTab />}
        {activeTab === "news"    && <NewsTab />}
      </div>

      {/* Bottom nav */}
      <div style={C.bnav}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex:1, background:"none", border:"none", cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"4px 0",
              opacity: activeTab === t.id ? 1 : 0.38, transition:"opacity .2s" }}>
            <span style={{ fontSize:21 }}>{t.icon}</span>
            <span style={{ fontSize:11, color: activeTab === t.id ? "#7eb3ff" : "#a0aec0",
              fontWeight: activeTab === t.id ? 700 : 400 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Stock Detail Modal */}
      {selectedStock && (
        <div style={C.modal}>
          <div style={{ ...C.hdr, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
            <button onClick={() => setSelectedId(null)}
              style={{ background:"none", border:"none", color:"#7eb3ff", fontSize:22, cursor:"pointer", lineHeight:1 }}>←</button>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:19, fontWeight:800 }}>{selectedStock.name}</div>
              <div style={{ fontSize:12, color:"#4a6080" }}>{selectedStock.ticker} · {selectedStock.sector}</div>
            </div>
            {(holdings[selectedId] || 0) > 0 && (
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, color:"#4a6080" }}>보유</div>
                <div style={{ ...C.mono, fontSize:14, fontWeight:700, color:"#7eb3ff" }}>{holdings[selectedId]}주</div>
              </div>
            )}
          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 24px" }}>
            {/* Price card */}
            <div style={C.card}>
              <div style={{ ...C.mono, fontSize:32, fontWeight:700 }}>{fmt(selectedStock.price)}원</div>
              <div style={{ ...C.mono, fontSize:15, color:clr(selectedStock.changePct), marginTop:4 }}>
                {selectedStock.change >= 0 ? "▲" : "▼"} {fmt(Math.abs(selectedStock.change))}원 ({fmtPct(selectedStock.changePct)})
              </div>
              <div style={{ display:"flex", gap:24, marginTop:10, marginBottom:12 }}>
                <div>
                  <span style={{ fontSize:11, color:"#4a6080" }}>고점 </span>
                  <span style={{ ...C.mono, fontSize:13, color:upClr }}>{fmt(selectedStock.high)}</span>
                </div>
                <div>
                  <span style={{ fontSize:11, color:"#4a6080" }}>저점 </span>
                  <span style={{ ...C.mono, fontSize:13, color:dnClr }}>{fmt(selectedStock.low)}</span>
                </div>
              </div>
              <MiniChart history={selectedStock.history} color={clr(selectedStock.changePct)} />
            </div>

            {/* Earnings */}
            {selectedStock.earnings && (
              <div style={C.card}>
                <div style={{ fontSize:12, fontWeight:700, color:"#4a6080", marginBottom:6 }}>📊 분기 실적 ({selectedStock.earnings.q})</div>
                <div style={{ fontSize:17, fontWeight:700, color:clr(selectedStock.changePct) }}>{selectedStock.earnings.surprise}</div>
              </div>
            )}

            {/* Order panel */}
            <div style={C.card}>
              <div style={{ fontSize:12, color:"#4a6080", marginBottom:10 }}>현금 {fmt(Math.round(cash))}원 · 보유 {heldQty}주</div>

              {/* Qty control */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                <button onClick={() => setOrderQty(q => Math.max(1, q - 1))}
                  style={{ ...C.sBtn, fontSize:22, padding:"5px 16px" }}>−</button>
                <div style={{ ...C.mono, flex:1, textAlign:"center", fontSize:24, fontWeight:700 }}>{orderQty}</div>
                <button onClick={() => setOrderQty(q => q + 1)}
                  style={{ ...C.sBtn, fontSize:22, padding:"5px 16px" }}>+</button>
              </div>

              {/* Pct buttons */}
              <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                {[0.1, 0.25, 0.5].map(p => (
                  <button key={p} onClick={() => setByPct(p)} style={C.sBtn}>{p * 100}%</button>
                ))}
                <button onClick={() => setByPct("mb")} style={{ ...C.sBtn, color:"#ff3d5a" }}>최대매수</button>
                <button onClick={() => setByPct("ms")} style={{ ...C.sBtn, color:dnClr }}>최대매도</button>
              </div>

              <div style={{ ...C.mono, fontSize:14, color:"#7eb3ff", marginBottom:14 }}>
                주문 금액: <strong>{fmt(selectedStock.price * orderQty)}</strong>원
              </div>

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={buy}  style={tradBtn("#ff3d5a")} disabled={selectedStock.price * orderQty > cash}>▲ 매수</button>
                <button onClick={sell} style={tradBtn(dnClr)}     disabled={heldQty === 0}>▼ 매도</button>
              </div>
            </div>

            {/* News for this stock */}
            {news.filter(n => n.stockId === selectedId).length > 0 && (
              <div style={C.card}>
                <div style={{ fontSize:12, fontWeight:700, color:"#4a6080", marginBottom:8 }}>관련 뉴스</div>
                {news.filter(n => n.stockId === selectedId).slice(0, 5).map(n => (
                  <div key={n.id} style={{ padding:"8px 0", borderBottom:"1px solid #0e2040", fontSize:13, lineHeight:1.5 }}>
                    {n.headline}
                    <div style={{ fontSize:11, color:"#4a6080", marginTop:2 }}>{n.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
