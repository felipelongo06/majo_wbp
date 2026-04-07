import { useState, useMemo, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1c3tp3VMKU49Ix5r0rFEVPmT0_tLJJt8qzQ-w8CrjaMQ/export?format=csv";

const C = {
  dark: "#1C2533", dark2: "#212E3F", green: "#3AE860", greenDark: "#1A5530",
  gray: "#888888", grayLight: "#AABBC8", white: "#FFFFFF", light: "#F3F3F3"
};

const parseBR = (s) => {
  if (!s || s === "" || s === "0") return 0;
  const clean = String(s).replace(/\./g, "").replace(",", ".").replace("%", "").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

const classifyService = (campaign) => {
  if (!campaign) return "clinica";
  const lower = campaign.toLowerCase();
  if (lower.includes("loja")) return "loja";
  if (lower.includes("company")) return "company";
  return "clinica";
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (let c = 0; c < lines[i].length; c++) {
      const ch = lines[i][c];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { fields.push(current); current = ""; }
      else { current += ch; }
    }
    fields.push(current);
    if (fields.length < 7) continue;
    const date = fields[0]?.trim();
    const campaign = fields[1]?.trim();
    if (!date || !date.match(/^\d{4}-/)) continue;
    const spend = parseBR(fields[2]);
    const impressions = Math.round(parseBR(fields[3]));
    const clicks = Math.round(parseBR(fields[4]));
    const contacts = Math.round(parseBR(fields[6]));
    const costPerContact = contacts > 0 ? parseBR(fields[7]) : null;
    const convRate = clicks > 0 ? (contacts / clicks) * 100 : 0;
    rows.push({
      date, campaign, service: classifyService(campaign),
      spend, impressions, clicks,
      conv_rate: Math.round(convRate * 100) / 100,
      contacts,
      cost_per_contact: costPerContact !== null ? Math.round(costPerContact * 100) / 100 : null
    });
  }
  return rows;
};

const fmt = (n) => {
  if (n === null || n === undefined) return "\u2014";
  if (n >= 1000000) return (n/1000000).toFixed(1) + "M";
  if (n >= 1000) return (n/1000).toFixed(1) + "k";
  return n.toLocaleString("pt-BR");
};
const fmtBRL = (n) => n === null || n === undefined ? "\u2014" : "R$ " + n.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtPct = (n) => n === null || n === undefined ? "\u2014" : n.toFixed(2) + "%";

export default function Dashboard() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [service, setService] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [rightMetric, setRightMetric] = useState("contacts");
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(SHEET_URL)
      .then(r => { if (!r.ok) throw new Error("Erro ao carregar planilha"); return r.text(); })
      .then(csv => {
        const parsed = parseCSV(csv);
        if (parsed.length === 0) throw new Error("Planilha vazia ou formato invalido");
        setRawData(parsed);
        setLastUpdate(new Date());
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const mob = w < 768;
  const compact = w < 1200;
  const pad = mob ? "14px" : "24px 32px";
  const pageSize = 20;

  const metricOptions = {
    spend: { label: "Valor Usado", fmtTip: v => "R$ " + v.toFixed(2) },
    impressions: { label: "Impressoes", fmtTip: v => v.toLocaleString("pt-BR") },
    clicks: { label: "Cliques", fmtTip: v => v.toLocaleString("pt-BR") },
    conv_rate: { label: "Tx Conversao", fmtTip: v => v.toFixed(2) + "%" },
    contacts: { label: "Contatos", fmtTip: v => v.toLocaleString("pt-BR") },
    cost_per_contact: { label: "Custo/Contato", fmtTip: v => v !== null ? "R$ " + v.toFixed(2) : "\u2014" }
  };

  const data = useMemo(() => {
    let rows = [...rawData];
    if (service !== "all") rows = rows.filter(r => r.service === service);
    if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
    if (dateTo) rows = rows.filter(r => r.date <= dateTo);
    const byDate = {};
    rows.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {date: r.date, spend:0, impressions:0, clicks:0, contacts:0};
      const d = byDate[r.date];
      d.spend += r.spend;
      d.impressions += r.impressions;
      d.clicks += r.clicks;
      d.contacts += r.contacts;
    });
    return Object.values(byDate).map(d => ({
      ...d,
      spend: Math.round(d.spend * 100) / 100,
      conv_rate: d.clicks > 0 ? Math.round((d.contacts / d.clicks) * 10000) / 100 : 0,
      cost_per_contact: d.contacts > 0 ? Math.round((d.spend / d.contacts) * 100) / 100 : null
    }));
  }, [rawData, service, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (va === null) va = -Infinity;
      if (vb === null) vb = -Infinity;
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [data, sortCol, sortDir]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  const kpis = useMemo(() => {
    const spend = data.reduce((s,r) => s + r.spend, 0);
    const impressions = data.reduce((s,r) => s + r.impressions, 0);
    const clicks = data.reduce((s,r) => s + r.clicks, 0);
    const contacts = data.reduce((s,r) => s + r.contacts, 0);
    return {
      spend: Math.round(spend * 100) / 100, impressions, clicks, contacts,
      conv_rate: clicks > 0 ? Math.round((contacts / clicks) * 10000) / 100 : 0,
      cost_per_contact: contacts > 0 ? Math.round((spend / contacts) * 100) / 100 : null
    };
  }, [data]);

  const chartData = useMemo(() => [...data].sort((a,b) => a.date.localeCompare(b.date)), [data]);
  const chart30 = useMemo(() => chartData.slice(-30), [chartData]);

  const presets = useMemo(() => {
    const today = new Date();
    const iso = d => d.toISOString().slice(0,10);
    return [
      { label: "Ontem", from: (() => { const y = new Date(today); y.setDate(y.getDate()-1); return iso(y); })(), to: (() => { const y = new Date(today); y.setDate(y.getDate()-1); return iso(y); })() },
      { label: "7 dias", from: (() => { const d = new Date(today); d.setDate(d.getDate()-6); return iso(d); })(), to: iso(today) },
      { label: "14 dias", from: (() => { const d = new Date(today); d.setDate(d.getDate()-13); return iso(d); })(), to: iso(today) },
      { label: "30 dias", from: (() => { const d = new Date(today); d.setDate(d.getDate()-29); return iso(d); })(), to: iso(today) },
      { label: "Mes anterior", from: iso(new Date(today.getFullYear(), today.getMonth()-1, 1)), to: iso(new Date(today.getFullYear(), today.getMonth(), 0)) },
      { label: "Mes atual", from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) },
      { label: "Este ano", from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) },
    ];
  }, []);

  const chipStyle = (active) => ({
    padding: "5px 14px", border: "1px solid " + (active ? C.green : C.greenDark), borderRadius: 20, cursor: "pointer",
    fontSize: 11, fontWeight: 500, fontFamily: "Inter, sans-serif", transition: "all .2s",
    background: active ? C.green + "22" : "transparent", color: active ? C.green : C.grayLight
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
    setPage(0);
  };

  const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  const btnStyle = (active) => ({
    padding: mob ? "6px 12px" : "8px 20px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "Poppins, sans-serif",
    fontSize: mob ? 11 : 13, fontWeight: 600, transition: "all .2s",
    background: active ? C.green : C.dark2, color: active ? C.dark : C.grayLight,
    boxShadow: active ? "0 0 12px rgba(58,232,96,.3)" : "none"
  });

  const svcBtnStyle = (active) => ({
    padding: mob ? "6px 10px" : "8px 16px", border: active ? "2px solid " + C.green : "1px solid " + C.greenDark,
    borderRadius: 6, cursor: "pointer", fontFamily: "Inter, sans-serif",
    fontSize: mob ? 10 : 12, fontWeight: 600, transition: "all .2s",
    background: active ? C.green + "18" : C.dark2, color: active ? C.green : C.grayLight
  });

  if (loading) return (
    <div style={{background: C.dark, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif"}}>
      <div style={{width: 40, height: 40, border: "3px solid " + C.greenDark, borderTop: "3px solid " + C.green, borderRadius: "50%", animation: "spin 1s linear infinite"}} />
      <div style={{color: C.grayLight, marginTop: 16, fontSize: 14}}>Carregando dados da planilha...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{background: C.dark, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 32}}>
      <div style={{color: "#FF6B6B", fontSize: 18, fontWeight: 700, fontFamily: "Poppins", marginBottom: 8}}>Erro ao carregar dados</div>
      <div style={{color: C.grayLight, fontSize: 14, marginBottom: 20}}>{error}</div>
      <button onClick={() => window.location.reload()} style={{...btnStyle(true), padding: "10px 24px"}}>Tentar novamente</button>
    </div>
  );

  return (
    <div style={{background: C.dark, minHeight: "100vh", color: C.white, fontFamily: "Inter, sans-serif"}}>
      {/* Header */}
      <div style={{background: C.dark2, padding: pad, display: "flex", flexDirection: mob ? "column" : "row", alignItems: mob ? "flex-start" : "center", justifyContent: "space-between", gap: mob ? 12 : 0, borderBottom: "2px solid " + C.greenDark}}>
        <div>
          <div style={{fontFamily: "Poppins, sans-serif", fontSize: mob ? 18 : 24, fontWeight: 700, letterSpacing: -0.5}}>
            Dashboard de <span style={{color: C.green}}>Performance</span>
          </div>
          <div style={{fontSize: mob ? 10 : 12, color: C.grayLight, marginTop: 4}}>
            agencia<span style={{color: C.green, fontWeight: 700}}>.</span>wbp | comunicacao e marketing
            {lastUpdate && <span style={{marginLeft: 12, fontSize: 10, color: C.gray}}>Atualizado: {lastUpdate.toLocaleString("pt-BR")}</span>}
          </div>
        </div>
        <div style={{display: "flex", gap: 6, width: mob ? "100%" : "auto", flexWrap: "wrap"}}>
          <button style={svcBtnStyle(service==="all")} onClick={() => {setService("all"); setPage(0);}}>Todos</button>
          <button style={svcBtnStyle(service==="clinica")} onClick={() => {setService("clinica"); setPage(0);}}>Clinica</button>
          <button style={svcBtnStyle(service==="company")} onClick={() => {setService("company"); setPage(0);}}>In Company</button>
          <button style={svcBtnStyle(service==="loja")} onClick={() => {setService("loja"); setPage(0);}}>Loja</button>
        </div>
      </div>

      <div style={{padding: pad}}>
        {/* Date filter */}
        <div style={{display: "flex", flexDirection: "column", gap: 10, marginBottom: mob ? 16 : 24}}>
          <div style={{display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap"}}>
            <span style={{fontSize: mob ? 10 : 12, color: C.grayLight, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, width: mob ? "100%" : "auto", marginBottom: mob ? 2 : 0}}>Periodo:</span>
            {presets.map((p, i) => {
              const active = dateFrom === p.from && dateTo === p.to;
              return <button key={i} style={chipStyle(active)} onClick={() => { setDateFrom(p.from); setDateTo(p.to); setPage(0); }}>{p.label}</button>;
            })}
            {(dateFrom || dateTo) && <button onClick={() => {setDateFrom(""); setDateTo(""); setPage(0);}}
              style={{padding: "5px 14px", border: "1px solid " + C.gray, borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: "Inter, sans-serif", background: "transparent", color: C.grayLight}}>Limpar</button>}
          </div>
          <div style={{display: "flex", gap: 8, alignItems: "center", flexWrap: mob ? "wrap" : "nowrap"}}>
            <input type="date" value={dateFrom} onChange={e => {setDateFrom(e.target.value); setPage(0);}}
              style={{background: C.dark2, border: "1px solid " + C.greenDark, borderRadius: 6, padding: "6px 12px", color: C.white, fontSize: 13, fontFamily: "Inter", flex: mob ? "1 1 40%" : "none"}} />
            <span style={{color: C.grayLight, fontSize: 12}}>ate</span>
            <input type="date" value={dateTo} onChange={e => {setDateTo(e.target.value); setPage(0);}}
              style={{background: C.dark2, border: "1px solid " + C.greenDark, borderRadius: 6, padding: "6px 12px", color: C.white, fontSize: 13, fontFamily: "Inter", flex: mob ? "1 1 40%" : "none"}} />
            <span style={{marginLeft: mob ? 0 : "auto", fontSize: 12, color: C.gray}}>{data.length} dias</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{display: "grid", gridTemplateColumns: mob ? "repeat(2, 1fr)" : compact ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: mob ? 8 : compact ? 12 : 16, marginBottom: mob ? 16 : 28}}>
          {[
            {label: "Valor Usado", value: fmtBRL(kpis.spend), sub: "total investido"},
            {label: "Impressoes", value: fmt(kpis.impressions), sub: "alcance"},
            {label: "Cliques", value: fmt(kpis.clicks), sub: "todos"},
            {label: "Tx Conv.", value: fmtPct(kpis.conv_rate), sub: "cliques > contatos"},
            {label: "Contatos", value: kpis.contacts.toLocaleString("pt-BR"), sub: "por mensagem"},
            {label: "Custo/Cont.", value: fmtBRL(kpis.cost_per_contact), sub: "medio"}
          ].map((k, i) => (
            <div key={i} style={{background: C.dark2, borderRadius: 10, padding: mob ? "10px 10px" : compact ? "14px 12px" : "20px 16px", position: "relative", overflow: "hidden", minWidth: 0}}>
              <div style={{position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: C.green, borderRadius: "10px 0 0 10px"}} />
              <div style={{fontSize: mob ? 8 : compact ? 9 : 10, color: C.grayLight, textTransform: "uppercase", letterSpacing: mob ? 0.8 : 1.5, fontWeight: 600, marginBottom: mob ? 3 : 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{k.label}</div>
              <div style={{fontSize: mob ? 14 : compact ? 17 : 22, fontWeight: 700, fontFamily: "Poppins, sans-serif", color: C.green, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{k.value}</div>
              <div style={{fontSize: mob ? 8 : 10, color: C.gray, marginTop: mob ? 2 : 4}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div style={{display: "grid", gridTemplateColumns: mob ? "1fr" : "1fr 1fr", gap: mob ? 12 : 16, marginBottom: mob ? 20 : 28}}>
          <div style={{background: C.dark2, borderRadius: 10, padding: mob ? "14px" : "20px"}}>
            <div style={{fontSize: mob ? 12 : 13, fontWeight: 600, color: C.grayLight, marginBottom: 12, fontFamily: "Poppins"}}>Investimento Diario (ultimos 30 dias)</div>
            <ResponsiveContainer width="100%" height={mob ? 160 : 200}>
              <BarChart data={chart30}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.greenDark} />
                <XAxis dataKey="date" tick={{fill: C.gray, fontSize: mob ? 7 : 9}} tickFormatter={d => d.slice(5)} interval={mob ? 3 : "preserveStartEnd"} />
                <YAxis tick={{fill: C.gray, fontSize: mob ? 7 : 9}} width={mob ? 35 : 60} />
                <Tooltip contentStyle={{background: C.dark, border: "1px solid " + C.greenDark, borderRadius: 8, color: C.white, fontSize: 11}}
                  formatter={(v) => ["R$ " + v.toFixed(2), "Spend"]} labelFormatter={l => l} />
                <Bar dataKey="spend" fill={C.green} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{background: C.dark2, borderRadius: 10, padding: mob ? "14px" : "20px"}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8}}>
              <div style={{fontSize: mob ? 12 : 13, fontWeight: 600, color: C.grayLight, fontFamily: "Poppins"}}>{metricOptions[rightMetric].label}</div>
              <select value={rightMetric} onChange={e => setRightMetric(e.target.value)}
                style={{background: C.dark, border: "1px solid " + C.greenDark, borderRadius: 6, padding: "5px 10px", color: C.green, fontSize: 12, fontFamily: "Inter", fontWeight: 600, cursor: "pointer", outline: "none"}}>
                {Object.entries(metricOptions).map(([k, v]) => (
                  <option key={k} value={k} style={{background: C.dark, color: C.white}}>{v.label}</option>
                ))}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={mob ? 160 : 200}>
              <LineChart data={chart30}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.greenDark} />
                <XAxis dataKey="date" tick={{fill: C.gray, fontSize: mob ? 7 : 9}} tickFormatter={d => d.slice(5)} interval={mob ? 3 : "preserveStartEnd"} />
                <YAxis tick={{fill: C.gray, fontSize: mob ? 7 : 9}} width={mob ? 35 : 60} />
                <Tooltip contentStyle={{background: C.dark, border: "1px solid " + C.greenDark, borderRadius: 8, color: C.white, fontSize: 11}}
                  formatter={(v) => [metricOptions[rightMetric].fmtTip(v), metricOptions[rightMetric].label]} />
                <Line type="monotone" dataKey={rightMetric} stroke={C.green} strokeWidth={2} dot={{r: 2, fill: C.green}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div style={{background: C.dark2, borderRadius: 10, overflow: "hidden"}}>
          <div style={{padding: mob ? "12px 14px" : "16px 20px", borderBottom: "1px solid " + C.greenDark, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 4}}>
            <span style={{fontSize: mob ? 13 : 14, fontWeight: 600, fontFamily: "Poppins", color: C.grayLight}}>Dia a Dia</span>
            <span style={{fontSize: mob ? 10 : 11, color: C.gray}}>{mob ? `${page+1}/${totalPages}` : `Pagina ${page+1} de ${totalPages} | Clique no cabecalho para ordenar`}</span>
          </div>
          <div style={{overflowX: "auto", WebkitOverflowScrolling: "touch"}}>
            <table style={{width: "100%", borderCollapse: "collapse", fontSize: mob ? 11 : 12, minWidth: mob ? 580 : "auto"}}>
              <thead>
                <tr style={{borderBottom: "1px solid " + C.greenDark}}>
                  {[
                    {key: "date", label: "Data"},
                    {key: "spend", label: "Valor Usado"},
                    {key: "impressions", label: "Impr."},
                    {key: "clicks", label: "Cliques"},
                    {key: "conv_rate", label: "Tx Conv."},
                    {key: "contacts", label: "Contatos"},
                    {key: "cost_per_contact", label: "Custo/Cont."}
                  ].map(h => (
                    <th key={h.key} onClick={() => toggleSort(h.key)}
                      style={{padding: mob ? "8px 8px" : "10px 14px", textAlign: h.key === "date" ? "left" : "right", color: C.green, fontWeight: 600, cursor: "pointer", fontSize: mob ? 10 : 11, whiteSpace: "nowrap", userSelect: "none"}}>
                      {h.label}{arrow(h.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r, i) => (
                  <tr key={i} style={{borderBottom: "1px solid " + C.greenDark + "44", transition: "background .15s"}}
                    onMouseEnter={e => e.currentTarget.style.background = C.greenDark + "33"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{padding: mob ? "6px 8px" : "8px 14px", color: C.white, fontWeight: 500, whiteSpace: "nowrap"}}>{r.date}</td>
                    <td style={{padding: mob ? "6px 8px" : "8px 14px", textAlign: "right", color: C.grayLight}}>{fmtBRL(r.spend)}</td>
                    <td style={{padding: mob ? "6px 8px" : "8px 14px", textAlign: "right", color: C.grayLight}}>{fmt(r.impressions)}</td>
                    <td style={{padding: mob ? "6px 8px" : "8px 14px", textAlign: "right", color: C.grayLight}}>{fmt(r.clicks)}</td>
                    <td style={{padding: mob ? "6px 8px" : "8px 14px", textAlign: "right", color: r.conv_rate > 10 ? C.green : C.grayLight, fontWeight: r.conv_rate > 10 ? 600 : 400}}>{fmtPct(r.conv_rate)}</td>
                    <td style={{padding: mob ? "6px 8px" : "8px 14px", textAlign: "right", color: C.white, fontWeight: 600}}>{r.contacts}</td>
                    <td style={{padding: mob ? "6px 8px" : "8px 14px", textAlign: "right", color: C.grayLight}}>{r.cost_per_contact !== null ? fmtBRL(r.cost_per_contact) : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding: "12px 20px", display: "flex", justifyContent: "center", gap: 8, borderTop: "1px solid " + C.greenDark}}>
            <button disabled={page===0} onClick={() => setPage(p => p-1)}
              style={{...btnStyle(false), opacity: page===0 ? .3 : 1, padding: "6px 16px", fontSize: 12}}>Anterior</button>
            <span style={{color: C.gray, fontSize: 12, display: "flex", alignItems: "center"}}>{page+1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p+1)}
              style={{...btnStyle(false), opacity: page >= totalPages-1 ? .3 : 1, padding: "6px 16px", fontSize: 12}}>Proximo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
