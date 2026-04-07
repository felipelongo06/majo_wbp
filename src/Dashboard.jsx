import { useState, useMemo, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const SHEET_ID1 = "1c3tp3VMKU49Ix5r0rFEVPmT0_tLJJt8qzQ-w8CrjaMQ";
const SHEET_ID2 = "1N-U9P725oIDPL9iEx7KsdjAtRDCeJQTyXXi6oYQDxgU";
const gvizURL = (id, sheet) => `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

const C = { dark:"#1C2533",dark2:"#212E3F",green:"#3AE860",greenDark:"#1A5530",gray:"#888888",grayLight:"#AABBC8",white:"#FFFFFF",red:"#FF6B6B",yellow:"#FFD93D" };

const parseBR = (s) => { if(!s||s==="")return 0; const c=String(s).replace(/"/g,"").replace(/R\$\s*/g,"").replace(/\./g,"").replace(",",".").replace("%","").trim(); const n=parseFloat(c); return isNaN(n)?0:n; };
const classifyService = (c) => { if(!c)return"clinica"; const l=c.toLowerCase(); if(l.includes("loja"))return"loja"; if(l.includes("company"))return"company"; return"clinica"; };
const parseCSVFields = (line) => { const f=[]; let cur="",inQ=false; for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"')inQ=!inQ; else if(ch===','&&!inQ){f.push(cur.trim());cur="";}else cur+=ch;} f.push(cur.trim()); return f; };

const parseMetaCSV = (text) => {
  const lines=text.split(/\r?\n/).filter(l=>l.trim()), rows=[];
  for(let i=1;i<lines.length;i++){const f=parseCSVFields(lines[i]);const date=f[0],campaign=f[1];if(!date||!date.match(/^\d{4}-/))continue;
    const spend=parseBR(f[2]),impressions=Math.round(parseBR(f[3])),clicks=Math.round(parseBR(f[4])),contacts=Math.round(parseBR(f[6]));
    rows.push({date,campaign,platform:"meta",service:classifyService(campaign),spend,impressions,clicks,contacts,
      conv_rate:clicks>0?Math.round((contacts/clicks)*10000)/100:0,cost_per_contact:contacts>0?Math.round((spend/contacts)*100)/100:null});}
  return rows;
};
const parseGoogleCSV = (text) => {
  const lines=text.split(/\r?\n/).filter(l=>l.trim()), rows=[];
  for(let i=1;i<lines.length;i++){const f=parseCSVFields(lines[i]);const date=f[0],campaign=f[1];if(!date||!date.match(/^\d{4}-/))continue;
    const spend=parseBR(f[3]),impressions=Math.round(parseBR(f[4])),clicks=Math.round(parseBR(f[5])),contacts=Math.round(parseBR(f[7]));
    rows.push({date,campaign,platform:"google",service:classifyService(campaign),spend,impressions,clicks,contacts,
      conv_rate:clicks>0?Math.round((contacts/clicks)*10000)/100:0,cost_per_contact:contacts>0?Math.round((spend/contacts)*100)/100:null});}
  return rows;
};

const parseFunnelSheet = (text, sheetName) => {
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  const rows = []; 
  for(const line of lines){ rows.push(parseCSVFields(line)); }
  const getVal = (rowIdx) => rows[rowIdx] && rows[rowIdx][1] ? parseBR(rows[rowIdx][1]) : 0;
  const isDec = sheetName.includes("Dezembro");
  if (isDec) {
    return { agendamentos: Math.round(getVal(5)), comparecimentos: Math.round(getVal(7)), vendas: Math.round(getVal(9)), valorVendido: getVal(15) };
  }
  return { agendamentos: Math.round(getVal(6) + getVal(7)), comparecimentos: Math.round(getVal(9)), vendas: Math.round(getVal(11)), valorVendido: getVal(12) };
};

const fmt=(n)=>{if(n==null)return"\u2014";if(n>=1e6)return(n/1e6).toFixed(1)+"M";if(n>=1e3)return(n/1e3).toFixed(1)+"k";return n.toLocaleString("pt-BR");};
const fmtBRL=(n)=>n==null?"\u2014":"R$ "+n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct=(n)=>n==null?"\u2014":n.toFixed(2)+"%";
const iso=(d)=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return iso(d);};
const daysBetween=(a,b)=>Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000);

const aggregateByDate=(rows)=>{const byDate={};rows.forEach(r=>{if(!byDate[r.date])byDate[r.date]={date:r.date,spend:0,impressions:0,clicks:0,contacts:0};const d=byDate[r.date];d.spend+=r.spend;d.impressions+=r.impressions;d.clicks+=r.clicks;d.contacts+=r.contacts;});return Object.values(byDate).map(d=>({...d,spend:Math.round(d.spend*100)/100,conv_rate:d.clicks>0?Math.round((d.contacts/d.clicks)*10000)/100:0,cost_per_contact:d.contacts>0?Math.round((d.spend/d.contacts)*100)/100:null}));};
const computeKPIs=(rows)=>{const spend=rows.reduce((s,r)=>s+r.spend,0),impressions=rows.reduce((s,r)=>s+r.impressions,0),clicks=rows.reduce((s,r)=>s+r.clicks,0),contacts=rows.reduce((s,r)=>s+r.contacts,0);return{spend:Math.round(spend*100)/100,impressions,clicks,contacts,conv_rate:clicks>0?Math.round((contacts/clicks)*10000)/100:0,cost_per_contact:contacts>0?Math.round((spend/contacts)*100)/100:null};};

const FUNNEL_MONTHS = [
  { key:"2025-12", label:"Dez/25", sheet:"Dezembro 25" },
  { key:"2026-01", label:"Jan/26", sheet:"Janeiro 26" },
  { key:"2026-02", label:"Fev/26", sheet:"Fevereiro 26" },
  { key:"2026-03", label:"Mar/26", sheet:"Março 26" },
  { key:"2026-04", label:"Abr/26", sheet:"Abril 26" },
];

export default function Dashboard() {
  const [rawData,setRawData]=useState([]);
  const [funnelData,setFunnelData]=useState({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [lastUpdate,setLastUpdate]=useState(null);
  const [platform,setPlatform]=useState("all");
  const [service,setService]=useState("all");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [sortCol,setSortCol]=useState("date");
  const [sortDir,setSortDir]=useState("desc");
  const [page,setPage]=useState(0);
  const [rightMetric,setRightMetric]=useState("contacts");
  const [w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);
  const [compareMode,setCompareMode]=useState("none");
  const [compFrom,setCompFrom]=useState("");
  const [compTo,setCompTo]=useState("");
  const [funnelMonth,setFunnelMonth]=useState("2026-03");

  useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);

  useEffect(()=>{
    setLoading(true); setError(null);
    const fetchAds = Promise.all([
      fetch(gvizURL(SHEET_ID1,"Meta Ads")).then(r=>r.text()),
      fetch(gvizURL(SHEET_ID1,"Google Ads")).then(r=>r.text())
    ]).then(([m,g])=>[...parseMetaCSV(m),...parseGoogleCSV(g)]);

    const fetchFunnel = Promise.all(
      FUNNEL_MONTHS.map(m=>fetch(gvizURL(SHEET_ID2,m.sheet)).then(r=>r.text()).then(csv=>({key:m.key,data:parseFunnelSheet(csv,m.sheet)})).catch(()=>({key:m.key,data:{agendamentos:0,comparecimentos:0,vendas:0,valorVendido:0}})))
    ).then(results=>{const obj={};results.forEach(r=>obj[r.key]=r.data);return obj;});

    Promise.all([fetchAds,fetchFunnel]).then(([ads,funnel])=>{
      if(!ads.length) throw new Error("Nenhum dado encontrado");
      setRawData(ads); setFunnelData(funnel); setLastUpdate(new Date()); setLoading(false);
    }).catch(e=>{setError(e.message);setLoading(false);});
  },[]);

  const mob=w<768, compact=w<1200, pad=mob?"14px":"24px 32px", pageSize=20;
  const metricOptions={spend:{label:"Valor Usado",fmtTip:v=>"R$ "+v.toFixed(2)},impressions:{label:"Impressoes",fmtTip:v=>v.toLocaleString("pt-BR")},clicks:{label:"Cliques",fmtTip:v=>v.toLocaleString("pt-BR")},conv_rate:{label:"Tx Conversao",fmtTip:v=>v.toFixed(2)+"%"},contacts:{label:"Contatos",fmtTip:v=>v.toLocaleString("pt-BR")},cost_per_contact:{label:"Custo/Contato",fmtTip:v=>v!=null?"R$ "+v.toFixed(2):"\u2014"}};

  const filtered=useMemo(()=>{let rows=[...rawData];if(platform!=="all")rows=rows.filter(r=>r.platform===platform);if(service!=="all")rows=rows.filter(r=>r.service===service);return rows;},[rawData,platform,service]);
  const data=useMemo(()=>{let rows=filtered;if(dateFrom)rows=rows.filter(r=>r.date>=dateFrom);if(dateTo)rows=rows.filter(r=>r.date<=dateTo);return aggregateByDate(rows);},[filtered,dateFrom,dateTo]);

  const compPeriod=useMemo(()=>{if(compareMode==="none"||!dateFrom||!dateTo)return null;if(compareMode==="previous"){const days=daysBetween(dateFrom,dateTo);return{from:addDays(dateFrom,-(days+1)),to:addDays(dateFrom,-1)};}if(compareMode==="yoy")return{from:addDays(dateFrom,-365),to:addDays(dateTo,-365)};if(compareMode==="custom"&&compFrom&&compTo)return{from:compFrom,to:compTo};return null;},[compareMode,dateFrom,dateTo,compFrom,compTo]);
  const compData=useMemo(()=>{if(!compPeriod)return[];return aggregateByDate(filtered.filter(r=>r.date>=compPeriod.from&&r.date<=compPeriod.to));},[filtered,compPeriod]);
  const kpis=useMemo(()=>computeKPIs(data),[data]);
  const compKpis=useMemo(()=>compData.length>0?computeKPIs(compData):null,[compData]);
  const sorted=useMemo(()=>[...data].sort((a,b)=>{let va=a[sortCol]??-Infinity,vb=b[sortCol]??-Infinity;if(typeof va==="string")return sortDir==="asc"?va.localeCompare(vb):vb.localeCompare(va);return sortDir==="asc"?va-vb:vb-va;}),[data,sortCol,sortDir]);
  const paged=sorted.slice(page*pageSize,(page+1)*pageSize);
  const totalPages=Math.max(1,Math.ceil(sorted.length/pageSize));
  const chartData=useMemo(()=>[...data].sort((a,b)=>a.date.localeCompare(b.date)),[data]);
  const chart30=useMemo(()=>chartData.slice(-30),[chartData]);
  const chartMerged=useMemo(()=>{if(!compPeriod||compData.length===0)return chart30.map(r=>({...r}));const cs=[...compData].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);return chart30.map((r,i)=>{const comp=cs[i]||{};const res={...r};Object.keys(metricOptions).forEach(k=>{res["comp_"+k]=comp[k]??null;});return res;});},[chart30,compData,compPeriod]);

  // Funnel data for selected month
  const funnel = useMemo(() => {
    const monthRows = rawData.filter(r => r.date.startsWith(funnelMonth));
    const spend = monthRows.reduce((s,r) => s+r.spend, 0);
    const clicks = monthRows.reduce((s,r) => s+r.clicks, 0);
    const leads = monthRows.reduce((s,r) => s+r.contacts, 0);
    const fd = funnelData[funnelMonth] || { agendamentos:0, comparecimentos:0, vendas:0, valorVendido:0 };
    const roas = spend > 0 ? fd.valorVendido / spend : 0;
    return { spend: Math.round(spend*100)/100, clicks, leads, ...fd, roas: Math.round(roas*100)/100 };
  }, [rawData, funnelData, funnelMonth]);

  const presets=useMemo(()=>{const t=new Date();return[{label:"Ontem",from:(()=>{const y=new Date(t);y.setDate(y.getDate()-1);return iso(y);})(),to:(()=>{const y=new Date(t);y.setDate(y.getDate()-1);return iso(y);})()},{label:"7 dias",from:(()=>{const d=new Date(t);d.setDate(d.getDate()-6);return iso(d);})(),to:iso(t)},{label:"14 dias",from:(()=>{const d=new Date(t);d.setDate(d.getDate()-13);return iso(d);})(),to:iso(t)},{label:"30 dias",from:(()=>{const d=new Date(t);d.setDate(d.getDate()-29);return iso(d);})(),to:iso(t)},{label:"Mes anterior",from:iso(new Date(t.getFullYear(),t.getMonth()-1,1)),to:iso(new Date(t.getFullYear(),t.getMonth(),0))},{label:"Mes atual",from:iso(new Date(t.getFullYear(),t.getMonth(),1)),to:iso(t)},{label:"Este ano",from:iso(new Date(t.getFullYear(),0,1)),to:iso(t)}];},[]);

  const chipStyle=(a)=>({padding:"5px 14px",border:"1px solid "+(a?C.green:C.greenDark),borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:500,fontFamily:"Inter",transition:"all .2s",background:a?C.green+"22":"transparent",color:a?C.green:C.grayLight});
  const toggleSort=(col)=>{if(sortCol===col)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortCol(col);setSortDir("desc");}setPage(0);};
  const arrow=(col)=>sortCol===col?(sortDir==="asc"?" \u25B2":" \u25BC"):"";
  const btnStyle=(a)=>({padding:mob?"6px 12px":"8px 16px",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"Poppins",fontSize:mob?10:12,fontWeight:600,transition:"all .2s",background:a?C.green:C.dark2,color:a?C.dark:C.grayLight,boxShadow:a?"0 0 12px rgba(58,232,96,.3)":"none"});
  const svcBtnStyle=(a)=>({padding:mob?"5px 8px":"6px 14px",border:a?"2px solid "+C.green:"1px solid "+C.greenDark,borderRadius:6,cursor:"pointer",fontFamily:"Inter",fontSize:mob?10:11,fontWeight:600,transition:"all .2s",background:a?C.green+"18":C.dark2,color:a?C.green:C.grayLight});
  const compBtnStyle=(a)=>({padding:mob?"5px 8px":"6px 12px",border:a?"2px solid "+C.yellow:"1px solid "+C.greenDark,borderRadius:6,cursor:"pointer",fontFamily:"Inter",fontSize:mob?9:10,fontWeight:600,transition:"all .2s",background:a?C.yellow+"15":C.dark2,color:a?C.yellow:C.gray});

  const delta=(curr,prev,inv)=>{if(prev==null||prev===0||curr==null)return null;const p=((curr-prev)/Math.abs(prev))*100;return{pct:Math.round(p*10)/10,positive:inv?p<0:p>0};};
  const DeltaBadge=({curr,prev,invert})=>{const d=delta(curr,prev,invert);if(!d)return null;const color=d.positive?C.green:C.red;const ar=d.pct>0?"\u25B2":d.pct<0?"\u25BC":"";return<span style={{fontSize:mob?8:10,fontWeight:600,color,marginLeft:4}}>{ar} {Math.abs(d.pct).toFixed(1)}%</span>;};
  const comparing=compareMode!=="none"&&compPeriod&&compKpis;

  // Funnel step component
  const FunnelStep = ({label, value, fmtValue, width, prevValue, isFirst, isMoney}) => {
    const rate = !isFirst && prevValue > 0 ? ((value / prevValue) * 100) : null;
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,minWidth:0}}>
        {!isFirst && rate !== null && (
          <div style={{fontSize:mob?9:11,color:C.yellow,fontWeight:700,marginBottom:4,textAlign:"center"}}>
            {rate.toFixed(1)}%
          </div>
        )}
        {!isFirst && <div style={{width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:"6px solid "+C.yellow,marginBottom:4}}/>}
        <div style={{
          width: width+"%", minWidth: mob?50:70, background: `linear-gradient(135deg, ${C.green}${isFirst?"":"cc"}, ${C.greenDark})`,
          borderRadius: 8, padding: mob?"8px 4px":"12px 8px", textAlign:"center", transition:"all .3s",
          boxShadow: "0 2px 12px rgba(58,232,96,0.15)"
        }}>
          <div style={{fontSize:mob?14:20,fontWeight:700,fontFamily:"Poppins",color:C.dark}}>{fmtValue}</div>
          <div style={{fontSize:mob?8:10,fontWeight:600,color:C.dark+"cc",marginTop:2,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
        </div>
      </div>
    );
  };

  if(loading) return(<div style={{background:C.dark,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"Inter"}}><div style={{width:40,height:40,border:"3px solid "+C.greenDark,borderTop:"3px solid "+C.green,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{color:C.grayLight,marginTop:16,fontSize:14}}>Carregando dados...</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);
  if(error) return(<div style={{background:C.dark,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"Inter",padding:32}}><div style={{color:C.red,fontSize:18,fontWeight:700,fontFamily:"Poppins",marginBottom:8}}>Erro ao carregar dados</div><div style={{color:C.grayLight,fontSize:14,marginBottom:20}}>{error}</div><button onClick={()=>window.location.reload()} style={{...btnStyle(true),padding:"10px 24px"}}>Tentar novamente</button></div>);

  return (
    <div style={{background:C.dark,minHeight:"100vh",color:C.white,fontFamily:"Inter, sans-serif"}}>
      {/* Header */}
      <div style={{background:C.dark2,padding:pad,display:"flex",flexDirection:mob?"column":"row",alignItems:mob?"flex-start":"center",justifyContent:"space-between",gap:mob?10:0,borderBottom:"2px solid "+C.greenDark}}>
        <div>
          <div style={{fontFamily:"Poppins",fontSize:mob?18:24,fontWeight:700,letterSpacing:-0.5}}>Dashboard de <span style={{color:C.green}}>Performance</span></div>
          <div style={{fontSize:mob?10:12,color:C.grayLight,marginTop:4}}>agencia<span style={{color:C.green,fontWeight:700}}>.</span>wbp | comunicacao e marketing{lastUpdate&&<span style={{marginLeft:12,fontSize:10,color:C.gray}}>Atualizado: {lastUpdate.toLocaleString("pt-BR")}</span>}</div>
        </div>
        <div style={{display:"flex",flexDirection:mob?"column":"row",gap:mob?8:12,width:mob?"100%":"auto"}}>
          <div style={{display:"flex",gap:4}}>
            <button style={btnStyle(platform==="all")} onClick={()=>{setPlatform("all");setPage(0);}}>Todos</button>
            <button style={btnStyle(platform==="meta")} onClick={()=>{setPlatform("meta");setPage(0);}}>Meta Ads</button>
            <button style={btnStyle(platform==="google")} onClick={()=>{setPlatform("google");setPage(0);}}>Google Ads</button>
          </div>
          <div style={{display:"flex",gap:4}}>
            <button style={svcBtnStyle(service==="all")} onClick={()=>{setService("all");setPage(0);}}>Todos</button>
            <button style={svcBtnStyle(service==="clinica")} onClick={()=>{setService("clinica");setPage(0);}}>Clinica</button>
            <button style={svcBtnStyle(service==="company")} onClick={()=>{setService("company");setPage(0);}}>In Company</button>
            <button style={svcBtnStyle(service==="loja")} onClick={()=>{setService("loja");setPage(0);}}>Loja</button>
          </div>
        </div>
      </div>

      <div style={{padding:pad}}>
        {/* Date filter */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:mob?16:24}}>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:mob?10:12,color:C.grayLight,fontWeight:600,textTransform:"uppercase",letterSpacing:1,width:mob?"100%":"auto",marginBottom:mob?2:0}}>Periodo:</span>
            {presets.map((p,i)=>{const a=dateFrom===p.from&&dateTo===p.to;return<button key={i} style={chipStyle(a)} onClick={()=>{setDateFrom(p.from);setDateTo(p.to);setPage(0);}}>{p.label}</button>;})}
            {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");setPage(0);}} style={{padding:"5px 14px",border:"1px solid "+C.gray,borderRadius:20,cursor:"pointer",fontSize:11,fontWeight:500,fontFamily:"Inter",background:"transparent",color:C.grayLight}}>Limpar</button>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:mob?"wrap":"nowrap"}}>
            <input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(0);}} style={{background:C.dark2,border:"1px solid "+C.greenDark,borderRadius:6,padding:"6px 12px",color:C.white,fontSize:13,fontFamily:"Inter",flex:mob?"1 1 40%":"none"}}/>
            <span style={{color:C.grayLight,fontSize:12}}>ate</span>
            <input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(0);}} style={{background:C.dark2,border:"1px solid "+C.greenDark,borderRadius:6,padding:"6px 12px",color:C.white,fontSize:13,fontFamily:"Inter",flex:mob?"1 1 40%":"none"}}/>
            <span style={{marginLeft:mob?0:"auto",fontSize:12,color:C.gray}}>{data.length} dias</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",paddingTop:6,borderTop:"1px solid "+C.greenDark+"44"}}>
            <span style={{fontSize:mob?10:11,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>Comparar:</span>
            <button style={compBtnStyle(compareMode==="none")} onClick={()=>setCompareMode("none")}>Desativado</button>
            <button style={compBtnStyle(compareMode==="previous")} onClick={()=>{if(!dateFrom||!dateTo)return;setCompareMode("previous");}}>Periodo anterior</button>
            <button style={compBtnStyle(compareMode==="yoy")} onClick={()=>{if(!dateFrom||!dateTo)return;setCompareMode("yoy");}}>Ano anterior</button>
            <button style={compBtnStyle(compareMode==="custom")} onClick={()=>setCompareMode("custom")}>Personalizado</button>
          </div>
          {compareMode==="custom"&&(<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:mob?"wrap":"nowrap",paddingLeft:mob?0:20}}>
            <span style={{fontSize:11,color:C.yellow,fontWeight:600}}>Comparar com:</span>
            <input type="date" value={compFrom} onChange={e=>setCompFrom(e.target.value)} style={{background:C.dark2,border:"1px solid "+C.yellow+"66",borderRadius:6,padding:"5px 10px",color:C.yellow,fontSize:12,fontFamily:"Inter",flex:mob?"1 1 35%":"none"}}/>
            <span style={{color:C.grayLight,fontSize:11}}>ate</span>
            <input type="date" value={compTo} onChange={e=>setCompTo(e.target.value)} style={{background:C.dark2,border:"1px solid "+C.yellow+"66",borderRadius:6,padding:"5px 10px",color:C.yellow,fontSize:12,fontFamily:"Inter",flex:mob?"1 1 35%":"none"}}/>
          </div>)}
          {comparing&&compPeriod&&<div style={{fontSize:11,color:C.yellow,fontStyle:"italic"}}>Comparando com: {compPeriod.from} a {compPeriod.to} ({compData.length} dias)</div>}
        </div>

        {/* KPI Cards */}
        <div style={{display:"grid",gridTemplateColumns:mob?"repeat(2, 1fr)":compact?"repeat(3, 1fr)":"repeat(6, 1fr)",gap:mob?8:compact?12:16,marginBottom:mob?16:28}}>
          {[{label:"Valor Usado",value:fmtBRL(kpis.spend),sub:"total investido",key:"spend",inv:true},{label:"Impressoes",value:fmt(kpis.impressions),sub:"alcance",key:"impressions"},{label:"Cliques",value:fmt(kpis.clicks),sub:"todos",key:"clicks"},{label:"Tx Conv.",value:fmtPct(kpis.conv_rate),sub:"cliques > contatos",key:"conv_rate"},{label:"Contatos",value:kpis.contacts.toLocaleString("pt-BR"),sub:"por mensagem",key:"contacts"},{label:"Custo/Cont.",value:fmtBRL(kpis.cost_per_contact),sub:"medio",key:"cost_per_contact",inv:true}].map((k,i)=>(
            <div key={i} style={{background:C.dark2,borderRadius:10,padding:mob?"10px":"20px 16px",position:"relative",overflow:"hidden",minWidth:0}}>
              <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:C.green,borderRadius:"10px 0 0 10px"}}/>
              <div style={{fontSize:mob?8:compact?9:10,color:C.grayLight,textTransform:"uppercase",letterSpacing:mob?.8:1.5,fontWeight:600,marginBottom:mob?3:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.label}</div>
              <div style={{display:"flex",alignItems:"baseline",gap:4,flexWrap:"wrap"}}>
                <div style={{fontSize:mob?14:compact?17:22,fontWeight:700,fontFamily:"Poppins",color:C.green,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k.value}</div>
                {comparing&&<DeltaBadge curr={kpis[k.key]} prev={compKpis[k.key]} invert={k.inv}/>}
              </div>
              {comparing&&compKpis&&<div style={{fontSize:mob?8:9,color:C.yellow,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Ant: {k.key==="spend"||k.key==="cost_per_contact"?fmtBRL(compKpis[k.key]):k.key==="conv_rate"?fmtPct(compKpis[k.key]):k.key==="contacts"?compKpis[k.key]?.toLocaleString("pt-BR"):fmt(compKpis[k.key])}</div>}
              <div style={{fontSize:mob?8:10,color:C.gray,marginTop:mob?2:4}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:mob?12:16,marginBottom:mob?20:28}}>
          <div style={{background:C.dark2,borderRadius:10,padding:mob?"14px":"20px"}}>
            <div style={{fontSize:mob?12:13,fontWeight:600,color:C.grayLight,marginBottom:12,fontFamily:"Poppins"}}>Investimento Diario (ultimos 30 dias)</div>
            <ResponsiveContainer width="100%" height={mob?160:200}>
              <BarChart data={chartMerged}><CartesianGrid strokeDasharray="3 3" stroke={C.greenDark}/><XAxis dataKey="date" tick={{fill:C.gray,fontSize:mob?7:9}} tickFormatter={d=>d.slice(5)} interval={mob?3:"preserveStartEnd"}/><YAxis tick={{fill:C.gray,fontSize:mob?7:9}} width={mob?35:60}/><Tooltip contentStyle={{background:C.dark,border:"1px solid "+C.greenDark,borderRadius:8,color:C.white,fontSize:11}} formatter={(v,name)=>[v!=null?"R$ "+v.toFixed(2):"\u2014",name==="comp_spend"?"Anterior":"Atual"]}/><Bar dataKey="spend" fill={C.green} radius={[3,3,0,0]} name="Atual"/>{comparing&&<Bar dataKey="comp_spend" fill={C.yellow+"88"} radius={[3,3,0,0]} name="Anterior"/>}</BarChart>
            </ResponsiveContainer>
            {comparing&&<div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}><span style={{fontSize:10,color:C.green}}>● Atual</span><span style={{fontSize:10,color:C.yellow}}>● Anterior</span></div>}
          </div>
          <div style={{background:C.dark2,borderRadius:10,padding:mob?"14px":"20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8}}>
              <div style={{fontSize:mob?12:13,fontWeight:600,color:C.grayLight,fontFamily:"Poppins"}}>{metricOptions[rightMetric].label}</div>
              <select value={rightMetric} onChange={e=>setRightMetric(e.target.value)} style={{background:C.dark,border:"1px solid "+C.greenDark,borderRadius:6,padding:"5px 10px",color:C.green,fontSize:12,fontFamily:"Inter",fontWeight:600,cursor:"pointer",outline:"none"}}>{Object.entries(metricOptions).map(([k,v])=>(<option key={k} value={k} style={{background:C.dark,color:C.white}}>{v.label}</option>))}</select>
            </div>
            <ResponsiveContainer width="100%" height={mob?160:200}>
              <LineChart data={chartMerged}><CartesianGrid strokeDasharray="3 3" stroke={C.greenDark}/><XAxis dataKey="date" tick={{fill:C.gray,fontSize:mob?7:9}} tickFormatter={d=>d.slice(5)} interval={mob?3:"preserveStartEnd"}/><YAxis tick={{fill:C.gray,fontSize:mob?7:9}} width={mob?35:60}/><Tooltip contentStyle={{background:C.dark,border:"1px solid "+C.greenDark,borderRadius:8,color:C.white,fontSize:11}} formatter={(v,name)=>[v!=null?metricOptions[rightMetric].fmtTip(v):"\u2014",String(name).startsWith("comp_")?"Anterior":"Atual"]}/><Line type="monotone" dataKey={rightMetric} stroke={C.green} strokeWidth={2} dot={{r:2,fill:C.green}} name="Atual"/>{comparing&&<Line type="monotone" dataKey={"comp_"+rightMetric} stroke={C.yellow} strokeWidth={2} strokeDasharray="5 5" dot={{r:2,fill:C.yellow}} name="Anterior"/>}</LineChart>
            </ResponsiveContainer>
            {comparing&&<div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}><span style={{fontSize:10,color:C.green}}>{"\u2014"} Atual</span><span style={{fontSize:10,color:C.yellow}}>--- Anterior</span></div>}
          </div>
        </div>

        {/* FUNNEL */}
        <div style={{background:C.dark2,borderRadius:10,padding:mob?"14px":"24px",marginBottom:mob?20:28}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:mob?12:20,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:mob?14:18,fontWeight:700,fontFamily:"Poppins",color:C.white}}>Funil de <span style={{color:C.green}}>Vendas</span></div>
              <div style={{fontSize:mob?9:11,color:C.gray,marginTop:2}}>Da impressao a venda</div>
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {FUNNEL_MONTHS.map(m=>(
                <button key={m.key} style={{padding:mob?"4px 8px":"6px 14px",border:funnelMonth===m.key?"2px solid "+C.green:"1px solid "+C.greenDark,borderRadius:6,cursor:"pointer",fontFamily:"Inter",fontSize:mob?9:11,fontWeight:600,background:funnelMonth===m.key?C.green+"18":C.dark,color:funnelMonth===m.key?C.green:C.grayLight,transition:"all .2s"}} onClick={()=>setFunnelMonth(m.key)}>{m.label}</button>
              ))}
            </div>
          </div>

          {/* Funnel visualization */}
          <div style={{display:"flex",flexDirection:mob?"column":"row",alignItems:"center",gap:mob?0:4,padding:mob?"0":"0 16px"}}>
            {[
              {label:"Valor Gasto",value:funnel.spend,fmtValue:fmtBRL(funnel.spend),width:100,isFirst:true},
              {label:"Cliques",value:funnel.clicks,fmtValue:fmt(funnel.clicks),width:88,prevValue:null,isFirst:true},
              {label:"Leads",value:funnel.leads,fmtValue:fmt(funnel.leads),width:74,prevValue:funnel.clicks},
              {label:"Agendamentos",value:funnel.agendamentos,fmtValue:fmt(funnel.agendamentos),width:60,prevValue:funnel.leads},
              {label:"Comparecimentos",value:funnel.comparecimentos,fmtValue:fmt(funnel.comparecimentos),width:46,prevValue:funnel.agendamentos},
              {label:"Vendas",value:funnel.vendas,fmtValue:String(funnel.vendas),width:34,prevValue:funnel.comparecimentos},
            ].map((step,i)=>(
              <FunnelStep key={i} {...step} />
            ))}
          </div>

          {/* Bottom metrics */}
          <div style={{display:"flex",justifyContent:"center",gap:mob?16:40,marginTop:mob?16:24,paddingTop:16,borderTop:"1px solid "+C.greenDark+"66"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:mob?9:10,color:C.grayLight,textTransform:"uppercase",letterSpacing:1,fontWeight:600,marginBottom:4}}>Valor Vendido</div>
              <div style={{fontSize:mob?16:22,fontWeight:700,fontFamily:"Poppins",color:C.green}}>{fmtBRL(funnel.valorVendido)}</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:mob?9:10,color:C.grayLight,textTransform:"uppercase",letterSpacing:1,fontWeight:600,marginBottom:4}}>ROAS</div>
              <div style={{fontSize:mob?16:22,fontWeight:700,fontFamily:"Poppins",color:funnel.roas>=1?C.green:C.red}}>{funnel.roas.toFixed(2)}x</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:mob?9:10,color:C.grayLight,textTransform:"uppercase",letterSpacing:1,fontWeight:600,marginBottom:4}}>CAC</div>
              <div style={{fontSize:mob?16:22,fontWeight:700,fontFamily:"Poppins",color:C.green}}>{funnel.vendas>0?fmtBRL(funnel.spend/funnel.vendas):"\u2014"}</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{background:C.dark2,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:mob?"12px 14px":"16px 20px",borderBottom:"1px solid "+C.greenDark,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
            <span style={{fontSize:mob?13:14,fontWeight:600,fontFamily:"Poppins",color:C.grayLight}}>Dia a Dia</span>
            <span style={{fontSize:mob?10:11,color:C.gray}}>{mob?`${page+1}/${totalPages}`:`Pagina ${page+1} de ${totalPages} | Clique no cabecalho para ordenar`}</span>
          </div>
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:mob?11:12,minWidth:mob?580:"auto"}}>
              <thead><tr style={{borderBottom:"1px solid "+C.greenDark}}>
                {[{key:"date",label:"Data"},{key:"spend",label:"Valor Usado"},{key:"impressions",label:"Impr."},{key:"clicks",label:"Cliques"},{key:"conv_rate",label:"Tx Conv."},{key:"contacts",label:"Contatos"},{key:"cost_per_contact",label:"Custo/Cont."}].map(h=>(
                  <th key={h.key} onClick={()=>toggleSort(h.key)} style={{padding:mob?"8px 8px":"10px 14px",textAlign:h.key==="date"?"left":"right",color:C.green,fontWeight:600,cursor:"pointer",fontSize:mob?10:11,whiteSpace:"nowrap",userSelect:"none"}}>{h.label}{arrow(h.key)}</th>
                ))}
              </tr></thead>
              <tbody>{paged.map((r,i)=>(
                <tr key={i} style={{borderBottom:"1px solid "+C.greenDark+"44",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.greenDark+"33"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:mob?"6px 8px":"8px 14px",color:C.white,fontWeight:500,whiteSpace:"nowrap"}}>{r.date}</td>
                  <td style={{padding:mob?"6px 8px":"8px 14px",textAlign:"right",color:C.grayLight}}>{fmtBRL(r.spend)}</td>
                  <td style={{padding:mob?"6px 8px":"8px 14px",textAlign:"right",color:C.grayLight}}>{fmt(r.impressions)}</td>
                  <td style={{padding:mob?"6px 8px":"8px 14px",textAlign:"right",color:C.grayLight}}>{fmt(r.clicks)}</td>
                  <td style={{padding:mob?"6px 8px":"8px 14px",textAlign:"right",color:r.conv_rate>10?C.green:C.grayLight,fontWeight:r.conv_rate>10?600:400}}>{fmtPct(r.conv_rate)}</td>
                  <td style={{padding:mob?"6px 8px":"8px 14px",textAlign:"right",color:C.white,fontWeight:600}}>{r.contacts}</td>
                  <td style={{padding:mob?"6px 8px":"8px 14px",textAlign:"right",color:C.grayLight}}>{r.cost_per_contact!=null?fmtBRL(r.cost_per_contact):"\u2014"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{padding:"12px 20px",display:"flex",justifyContent:"center",gap:8,borderTop:"1px solid "+C.greenDark}}>
            <button disabled={page===0} onClick={()=>setPage(p=>p-1)} style={{...btnStyle(false),opacity:page===0?.3:1,padding:"6px 16px",fontSize:12}}>Anterior</button>
            <span style={{color:C.gray,fontSize:12,display:"flex",alignItems:"center"}}>{page+1} / {totalPages}</span>
            <button disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)} style={{...btnStyle(false),opacity:page>=totalPages-1?.3:1,padding:"6px 16px",fontSize:12}}>Proximo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
