(() => {
'use strict';
const $ = id => document.getElementById(id);
// Keep the v3 storage key so people opening the upgraded application keep their existing browser data.
const STORAGE_KEY = 'volmax_mixer_cashflow_v3';
const skuCatalog = [
  {article:'310701', label:'Чёрный'},
  {article:'310702', label:'Белый'},
  {article:'310703', label:'Серый'},
  {article:'310704', label:'Бежевый'},
  {article:'310801', label:'Графит / чёрный'},
  {article:'310803', label:'Графит / серый'}
];
const defaultState = () => ({
  version:4,
  settings:{
    modelStart:'2026-09-10', horizonMonths:6, unitCost:1150, multiplier:2.5, startingCash:0,
    periodDays:7, payoutLagMonths:1, openingStockCorrection:0,
    p1Pct:30, p2Days:50, p2Pct:30, p3Months:2, p3Pct:40
  },
  invoices:[
    {
      id:'inv-1008', number:'1008', date:'2026-06-02', total:3201420,
      sourceNote:'Дата взята из самого счёта: 02.06.2026. В имени файла указано 27.05.2026, поэтому для расчёта используется дата документа.',
      items:{'310701':900,'310702':300,'310703':500,'310704':300,'310801':600,'310803':400}
    },
    {
      id:'inv-2001', number:'2001', date:'2026-08-03', total:1491373,
      sourceNote:'Дата и сумма взяты из счёта №2001 от 03.08.2026.',
      items:{'310701':0,'310702':400,'310703':300,'310704':600,'310801':0,'310803':0}
    }
  ],
  paymentOverrides:{},
  manualPayments:[],
  actualSales:{}
});

const pad = n => String(n).padStart(2,'0');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const parseDate = s => { const [y,m,d]=String(s||'').split('-').map(Number); return new Date(y,m-1,d,12,0,0,0); };
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fmtDate = d => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`;
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+Number(n||0)); return x; };
const addMonthsSafe = (d,n) => { const x=new Date(d), day=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+Number(n||0)); const last=new Date(x.getFullYear(),x.getMonth()+1,0,12).getDate(); x.setDate(Math.min(day,last)); return x; };
const money2 = n => Math.round((Number(n)||0)*100)/100;
const fmtMoney = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:Math.abs(Number(n)%1)>0.0001?2:0,maximumFractionDigits:2}).format(Number(n)||0);
const fmtNumber = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(Number(n)||0);
const fmtInt = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.round(Number(n)||0));
const ruPlural = (n,one,few,many) => { n=Math.abs(Math.round(Number(n)||0)); const n100=n%100,n10=n%10; return (n100>=11&&n100<=14)?many:(n10===1?one:(n10>=2&&n10<=4?few:many)); };
const moneyShort = n => { n=Number(n)||0; if(Math.abs(n)>=1e6) return (n/1e6).toFixed(Math.abs(n)>=1e7?0:1).replace('.',',')+' млн'; if(Math.abs(n)>=1e3) return Math.round(n/1e3)+' тыс.'; return Math.round(n).toLocaleString('ru-RU'); };
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const monthLabel = k => { const names=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']; const [y,m]=k.split('-').map(Number); return `${names[m-1]} ${String(y).slice(-2)}`; };
const escapeHtml = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const hasOwn = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
const totalInvoiceQty = inv => skuCatalog.reduce((sum,s)=>sum+Math.max(0,Number(inv.items?.[s.article]||0)),0);
const netPerUnit = () => Math.max(0,Number(state.settings.unitCost||0)*Number(state.settings.multiplier||0));

function normalizeState(raw){
  if(!raw || !raw.settings || !Array.isArray(raw.invoices)) return defaultState();
  raw.version=4;
  raw.paymentOverrides ||= {};
  raw.manualPayments ||= [];
  raw.actualSales ||= {};
  raw.settings = {...defaultState().settings, ...raw.settings};
  raw.invoices = raw.invoices.map(inv=>({
    ...inv,
    id:inv.id||uid(),
    number:String(inv.number||''),
    date:inv.date||raw.settings.modelStart,
    total:Math.max(0,Number(inv.total||0)),
    items:Object.fromEntries(skuCatalog.map(s=>[s.article,Math.max(0,Math.floor(Number(inv.items?.[s.article]||0)))]))
  }));
  raw.manualPayments = raw.manualPayments.map(p=>({
    id:p.id||uid(), invoiceId:p.invoiceId||'', date:p.date||raw.settings.modelStart,
    amount:Math.max(0,Number(p.amount||0)), label:String(p.label||'Дополнительный платёж'),
    createdAt:Number(p.createdAt||Date.now())
  }));
  return raw;
}
let state;
try { state = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState()); }
catch (_) { state = defaultState(); }
let editingInvoiceId = null;
let editingPaymentId = null;
let confirmCallback = null;

function saveState(message='Сохранено в браузере'){
  const now=new Date(); let stored=true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (_) { stored=false; }
  $('saveState').textContent=stored?`${message} · ${pad(now.getHours())}:${pad(now.getMinutes())}`:`Сохранение в браузере недоступно · ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
function setStatus(message='',tone=''){
  const el=$('statusRegion'); el.textContent=message; el.dataset.tone=tone;
}
function readSettings(){
  const numeric=['horizonMonths','unitCost','multiplier','startingCash','periodDays','payoutLagMonths','openingStockCorrection','p1Pct','p2Days','p2Pct','p3Months','p3Pct'];
  state.settings.modelStart=$('modelStart').value;
  numeric.forEach(id=>state.settings[id]=Number($(id).value||0));
}
function writeSettings(){
  Object.entries(state.settings).forEach(([k,v])=>{ if($(k)) $(k).value=v; });
  $('netPerUnit').value=fmtNumber(netPerUnit());
}

function baseStages(inv){
  const s=state.settings, d=parseDate(inv.date);
  return [
    {kind:'stage',stage:'p1',stageIndex:0,pct:Number(s.p1Pct),date:d,label:`${fmtNumber(s.p1Pct)}% · дата счёта`,stock:false},
    {kind:'stage',stage:'p2',stageIndex:1,pct:Number(s.p2Pct),date:addDays(d,s.p2Days),label:`${fmtNumber(s.p2Pct)}% · +${fmtInt(s.p2Days)} дней`,stock:false},
    {kind:'stage',stage:'p3',stageIndex:2,pct:Number(s.p3Pct),date:addMonthsSafe(d,s.p3Months),label:`${fmtNumber(s.p3Pct)}% · +${fmtInt(s.p3Months)} мес.`,stock:true}
  ].map(r=>({...r,id:`${inv.id}:${r.stage}`,invoiceId:inv.id,invoiceNumber:inv.number,invoiceDate:inv.date,auto:money2(Number(inv.total||0)*r.pct/100),qty:r.stock?totalInvoiceQty(inv):0}));
}
function linkedManualPayments(invoiceId){
  return state.manualPayments.filter(p=>p.invoiceId===invoiceId).map(p=>({
    kind:'manual',id:p.id,manualPaymentId:p.id,invoiceId:p.invoiceId,date:parseDate(p.date),label:p.label||'Дополнительный платёж',
    amount:money2(p.amount),used:money2(p.amount),auto:null,stock:false,qty:0,createdAt:p.createdAt||0
  }));
}
function invoiceSchedule(inv){
  const stages=baseStages(inv);
  const manuals=linkedManualPayments(inv.id);
  const events=[...stages,...manuals].sort((a,b)=>{
    const byDate=a.date-b.date; if(byDate)return byDate;
    if(a.kind!==b.kind) return a.kind==='stage'?-1:1; // same-day extra payment changes only later stages
    if(a.kind==='stage') return a.stageIndex-b.stageIndex;
    return (a.createdAt||0)-(b.createdAt||0);
  });
  let balance=money2(inv.total);
  for(const ev of events){
    if(ev.kind==='manual'){
      ev.used=money2(ev.amount); balance=money2(balance-ev.used); continue;
    }
    const manualOverride=hasOwn(state.paymentOverrides,ev.id);
    let used;
    if(manualOverride){
      used=money2(Math.max(0,Number(state.paymentOverrides[ev.id]||0)));
    } else {
      const laterStages=stages.filter(s=>s.stageIndex>=ev.stageIndex);
      const weight=laterStages.reduce((a,s)=>a+Math.max(0,Number(s.pct)||0),0);
      if(weight<=0 || balance<=0) used=0;
      else if(laterStages.length===1) used=money2(Math.max(0,balance));
      else used=money2(Math.max(0,balance)*Math.max(0,ev.pct)/weight);
    }
    ev.used=used;
    ev.manualOverride=manualOverride;
    ev.recalculated=!manualOverride && Math.abs(used-ev.auto)>0.009;
    balance=money2(balance-used);
  }
  return {events,stages:events.filter(e=>e.kind==='stage'),balance};
}
function installmentSchedule(inv){ return invoiceSchedule(inv).stages; }
function standalonePayments(){
  return state.manualPayments.filter(p=>!p.invoiceId || !state.invoices.some(inv=>inv.id===p.invoiceId)).map(p=>({
    kind:'manual',id:p.id,manualPaymentId:p.id,invoiceId:'',invoiceNumber:'',invoiceDate:'',date:parseDate(p.date),
    label:p.label||'Дополнительный платёж',amount:money2(p.amount),used:money2(p.amount),auto:null,stock:false,qty:0,standalone:true,createdAt:p.createdAt||0
  }));
}
function allPayments(){
  const linked=state.invoices.flatMap(inv=>invoiceSchedule(inv).events.map(e=>({...e,invoiceNumber:inv.number,invoiceDate:inv.date})));
  return [...linked,...standalonePayments()].sort((a,b)=>{
    const byDate=a.date-b.date; if(byDate)return byDate;
    const byKind=(a.kind==='stage'?0:1)-(b.kind==='stage'?0:1); if(byKind)return byKind;
    const byStage=(a.stageIndex??999)-(b.stageIndex??999); if(byStage)return byStage;
    const byCreated=(a.createdAt||0)-(b.createdAt||0); if(byCreated)return byCreated;
    return String(a.id).localeCompare(String(b.id));
  });
}
function stockEvents(){
  return state.invoices.map(inv=>{
    const p3=baseStages(inv).find(x=>x.stage==='p3');
    return {date:p3.date,invoiceId:inv.id,invoiceNumber:inv.number,invoiceDate:inv.date,qty:totalInvoiceQty(inv),items:{...inv.items}};
  }).sort((a,b)=>a.date-b.date);
}
function makePeriods(){
  const s=state.settings, start=parseDate(s.modelStart), end=addMonthsSafe(start,Math.max(1,Number(s.horizonMonths)||1));
  const days=Math.max(1,Number(s.periodDays)||7), arr=[]; let cur=new Date(start);
  while(cur<=end){
    const pStart=new Date(cur); let pEnd=addDays(pStart,days-1); if(pEnd>end)pEnd=new Date(end);
    const key=iso(pStart); arr.push({key,start:pStart,end:pEnd,payout:addMonthsSafe(pEnd,Math.max(0,Number(s.payoutLagMonths)||0)),actual:Math.max(0,Math.floor(Number(state.actualSales[key]||0))),plan:0});
    cur=addDays(pEnd,1);
  }
  return {periods:arr,end};
}
function cumulativeStockAt(date){
  const start=parseDate(state.settings.modelStart);
  let qty=stockEvents().filter(e=>e.date<=date).reduce((a,e)=>a+e.qty,0);
  if(date>=start) qty += Number(state.settings.openingStockCorrection||0);
  return qty;
}
function computeModel(){
  const net=netPerUnit();
  const start=parseDate(state.settings.modelStart);
  const {periods,end:modelEnd}=makePeriods();
  const paymentHorizon=addMonthsSafe(modelEnd,Math.max(0,Number(state.settings.payoutLagMonths)||0));
  const payments=allPayments();
  const futurePayments=payments.filter(p=>p.date>=start && p.date<=paymentHorizon);
  const paymentGroups=[];
  futurePayments.forEach(p=>{
    const k=iso(p.date); let g=paymentGroups.find(x=>x.key===k); if(!g){g={key:k,date:p.date,items:[],amount:0};paymentGroups.push(g);} g.items.push(p); g.amount+=p.used;
  });
  paymentGroups.sort((a,b)=>a.date-b.date);

  function cumulativeSalesThrough(idx){ let n=0; for(let i=0;i<=idx;i++) n+=periods[i].actual+periods[i].plan; return n; }
  function canAdd(idx){
    for(let j=idx;j<periods.length;j++){
      const after=cumulativeSalesThrough(j)+1;
      const stock=cumulativeStockAt(periods[j].end);
      if(after>stock+1e-9) return false;
    }
    return true;
  }
  function allocateUnits(units,dueDate){
    let left=units, guard=0;
    const eligible=periods.map((p,i)=>({p,i})).filter(x=>x.p.payout<=dueDate);
    while(left>0 && guard<200000){
      guard++;
      const candidates=eligible.filter(x=>canAdd(x.i)).sort((a,b)=>{
        const at=(a.p.actual+a.p.plan), bt=(b.p.actual+b.p.plan);
        return at-bt || a.i-b.i;
      });
      if(!candidates.length) break;
      candidates[0].p.plan+=1; left--;
    }
    return left;
  }

  let cumulativePayments=0, externalPlanning=0;
  for(const g of paymentGroups){
    cumulativePayments+=g.amount;
    let generated=periods.filter(p=>p.payout<=g.date).reduce((a,p)=>a+(p.actual+p.plan)*net,0);
    let available=Number(state.settings.startingCash||0)+externalPlanning+generated;
    let shortage=Math.max(0,cumulativePayments-available);
    if(shortage>0.0001 && net>0){
      const needUnits=Math.ceil(shortage/net);
      allocateUnits(needUnits,g.date);
      generated=periods.filter(p=>p.payout<=g.date).reduce((a,p)=>a+(p.actual+p.plan)*net,0);
      available=Number(state.settings.startingCash||0)+externalPlanning+generated;
      shortage=Math.max(0,cumulativePayments-available);
    }
    if(shortage>0.0001){ externalPlanning+=shortage; }
  }

  let runningSales=0; let minStock=Infinity;
  periods.forEach(p=>{ runningSales+=p.actual+p.plan; p.stockBalance=cumulativeStockAt(p.end)-runningSales; minStock=Math.min(minStock,p.stockBalance); });
  if(!periods.length)minStock=0;

  const payoutMap={};
  periods.forEach(p=>{ const amount=(p.actual+p.plan)*net; if(amount>0){const k=iso(p.payout); (payoutMap[k] ||= []).push({period:p,amount});} });
  const paymentMap={};
  futurePayments.forEach(p=>{ const k=iso(p.date); (paymentMap[k] ||= []).push(p); });
  const dates=[...new Set([...Object.keys(payoutMap),...Object.keys(paymentMap)])].sort();
  const cashEvents=[]; let cash=Number(state.settings.startingCash||0), externalTotal=0;
  for(const k of dates){
    const payoutItems=payoutMap[k]||[], payItems=paymentMap[k]||[];
    const inflow=payoutItems.reduce((a,x)=>a+x.amount,0), outflow=payItems.reduce((a,x)=>a+x.used,0);
    cash+=inflow; let ext=0;
    if(cash+1e-9<outflow){ext=outflow-cash;cash+=ext;externalTotal+=ext;}
    cash-=outflow;
    const labels=[];
    if(payoutItems.length)labels.push(`выплата за ${payoutItems.length} период(а)`);
    if(payItems.length)labels.push(payItems.map(p=>p.invoiceId?`${fmtDate(parseDate(p.invoiceDate))} №${p.invoiceNumber} · ${p.label}`:`${p.label} · без счёта`).join('; '));
    cashEvents.push({date:parseDate(k),label:labels.join(' + '),inflow,outflow,external:ext,balance:cash});
  }

  const openingStock=cumulativeStockAt(start);
  const totalSales=periods.reduce((a,p)=>a+p.actual+p.plan,0);
  const planUnits=periods.reduce((a,p)=>a+p.plan,0);
  const endStock=cumulativeStockAt(modelEnd)-totalSales;
  const nextStock=stockEvents().find(e=>e.date>=start);
  const monthly={};
  futurePayments.forEach(p=>{const k=monthKey(p.date); (monthly[k] ||= {payments:0,inflows:0,actual:0,plan:0,salesMoney:0}); monthly[k].payments+=p.used;});
  periods.forEach(p=>{
    const saleK=monthKey(p.start); (monthly[saleK] ||= {payments:0,inflows:0,actual:0,plan:0,salesMoney:0}); monthly[saleK].actual+=p.actual;monthly[saleK].plan+=p.plan;monthly[saleK].salesMoney+=(p.actual+p.plan)*net;
    const payK=monthKey(p.payout); (monthly[payK] ||= {payments:0,inflows:0,actual:0,plan:0,salesMoney:0}); monthly[payK].inflows+=(p.actual+p.plan)*net;
  });
  const invoiceBalances=state.invoices.map(inv=>({inv,balance:invoiceSchedule(inv).balance}));
  const recalculatedCount=payments.filter(p=>p.kind==='stage'&&p.recalculated).length;
  return {net,start,modelEnd,paymentHorizon,payments,futurePayments,paymentGroups,periods,cashEvents,openingStock,endStock,nextStock,externalTotal,minStock,planUnits,totalSales,monthly,invoiceBalances,recalculatedCount};
}

function renderTerms(){
  $('railPct1').textContent=`${fmtNumber(state.settings.p1Pct)}%`;
  $('railPct2').textContent=`${fmtNumber(state.settings.p2Pct)}%`;
  $('railPct3').textContent=`${fmtNumber(state.settings.p3Pct)}%`;
  $('railDays').textContent=`+${fmtInt(state.settings.p2Days)} дней`;
  $('railMonths').textContent=`+${fmtInt(state.settings.p3Months)} ${ruPlural(state.settings.p3Months,'месяц','месяца','месяцев')} · приход`;
}
function renderAlerts(model){
  const items=[];
  const pct=Number(state.settings.p1Pct)+Number(state.settings.p2Pct)+Number(state.settings.p3Pct);
  if(Math.abs(pct-100)>0.001)items.push(`<div class="banner danger"><span>!</span><div><b>Проценты оплат сейчас дают ${fmtNumber(pct)}%.</b> Для исходной схемы сумма этапов должна быть 100%. После ручных изменений остаток счёта всё равно перераспределяется по будущим этапам.</div></div>`);
  const badBalances=model.invoiceBalances.filter(x=>Math.abs(x.balance)>0.01);
  if(badBalances.length)items.push(`<div class="banner danger"><span>!</span><div><b>${badBalances.length} ${ruPlural(badBalances.length,'счёт имеет','счёта имеют','счетов имеют')} незакрытый баланс.</b> Это бывает, когда вручную изменён последний платёж или сумма фиксированных платежей превышает сумму счёта. Баланс виден в реестре счетов.</div></div>`);
  if(model.recalculatedCount>0)items.push(`<div class="banner info"><span>↻</span><div><b>${model.recalculatedCount} ${ruPlural(model.recalculatedCount,'будущий этап пересчитан','будущих этапа пересчитаны','будущих этапов пересчитаны')} автоматически.</b> Ручные и дополнительные платежи считаются фиксированными, остаток распределяется только на более поздние автоматические этапы.</div></div>`);
  if(model.externalTotal>0.01)items.push(`<div class="banner warning"><span>₽</span><div><b>Кассовый разрыв ${fmtMoney(model.externalTotal)}.</b> На соответствующие даты выплаты от продаж ещё не успевают прийти или физического товара недостаточно для нужного объёма продаж. Смотрите строки «Внешние деньги» в денежном потоке.</div></div>`);
  const actualStockViolation=model.periods.some(p=>p.stockBalance<0);
  if(actualStockViolation)items.push(`<div class="banner danger"><span>!</span><div><b>Продажи превышают физический доступный товар.</b> Проверьте фактические продажи, дату прихода финального платежа или корректировку остатка на старте.</div></div>`);
  const hist=stockEvents().filter(e=>e.date<model.start).reduce((a,e)=>a+e.qty,0);
  if(hist>0)items.push(`<div class="banner info"><span>↳</span><div>До ${fmtDate(model.start)} по правилам оплаты уже есть приходы на <b>${fmtInt(hist)} шт.</b> В модели они формируют стартовый остаток. Если часть товара уже продана, внесите минус в «Корректировка остатка на старте».</div></div>`);
  $('alerts').innerHTML=items.join('');
}
function renderKpis(model){
  const futureTotal=model.futurePayments.reduce((a,p)=>a+p.used,0);
  $('kpiPayments').textContent=fmtMoney(futureTotal);
  $('kpiPaymentsSub').textContent=`${model.futurePayments.length} ${ruPlural(model.futurePayments.length,'платёж','платежа','платежей')} до ${fmtDate(model.paymentHorizon)}`;
  $('kpiUnits').textContent=`${fmtInt(model.planUnits)} шт.`;
  const max=model.periods.reduce((best,p)=>(p.actual+p.plan)>(best.actual+best.plan)?p:best,model.periods[0]||{actual:0,plan:0,start:model.start});
  $('kpiMaxWeek').textContent=`${fmtInt((max.actual||0)+(max.plan||0))} шт.`;
  $('kpiMaxWeekSub').textContent=max.start?`период с ${fmtDate(max.start)}`:'—';
  $('kpiGap').textContent=fmtMoney(model.externalTotal); $('kpiGapCard').dataset.tone=model.externalTotal>0.01?'danger':'';
  $('kpiOpeningStock').textContent=`${fmtInt(model.openingStock)} шт.`;
  const hist=stockEvents().filter(e=>e.date<=model.start).reduce((a,e)=>a+e.qty,0); $('kpiOpeningStockSub').textContent=`${fmtInt(hist)} по счетам ${Number(state.settings.openingStockCorrection||0)?' + корректировка':''}`;
  $('kpiEndStock').textContent=`${fmtInt(model.endStock)} шт.`;
  $('kpiNextStock').textContent=model.nextStock?`следующий приход ${fmtInt(model.nextStock.qty)} шт. · ${fmtDate(model.nextStock.date)}`:'новых приходов нет';
}
function balanceMarkup(balance){
  if(Math.abs(balance)<=0.01)return '<span class="balance-ok">0 ₽ · закрыт</span>';
  if(balance>0)return `<span class="balance-due">осталось ${fmtMoney(balance)}</span>`;
  return `<span class="balance-over">переплата ${fmtMoney(Math.abs(balance))}</span>`;
}
function stageMilestone(inv,p){
  const manual=p.manualOverride, recalc=p.recalculated;
  const meta=manual?`ручная сумма · база ${fmtMoney(p.auto)}`:recalc?`пересчитано · база ${fmtMoney(p.auto)}`:`база ${fmtMoney(p.auto)}`;
  return `<div class="milestone ${p.stock?'stock':''}"><b>${fmtNumber(p.pct)}% · ${fmtDate(p.date)}${p.stock?' · приход':''}</b><div class="milestone-edit"><input class="milestone-input" type="number" min="0" step="0.01" value="${p.used}" data-stage-override="${p.id}" aria-label="Платёж ${p.label} по счёту №${escapeHtml(inv.number)}"><button class="milestone-reset" type="button" data-reset-stage="${p.id}" ${manual?'':'hidden'} aria-label="Вернуть автоматический расчёт этапа">↺</button></div><span class="milestone-meta">${escapeHtml(meta)}</span></div>`;
}
function renderInvoices(){
  const body=$('invoiceBody'); body.innerHTML='';
  [...state.invoices].sort((a,b)=>parseDate(a.date)-parseDate(b.date)).forEach(inv=>{
    const summary=invoiceSchedule(inv), sched=summary.stages, p3=sched.find(p=>p.stage==='p3');
    const linked=state.manualPayments.filter(p=>p.invoiceId===inv.id);
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><div class="invoice-identity"><button class="icon-btn" type="button" data-expand="${inv.id}" aria-expanded="false" aria-label="Показать состав счёта №${escapeHtml(inv.number)}">＋</button><div><div class="invoice-date">${fmtDate(parseDate(inv.date))}</div><div class="invoice-no">счёт №${escapeHtml(inv.number)}</div></div></div></td>
      <td class="num money">${fmtMoney(inv.total)}</td><td class="num mono">${fmtInt(totalInvoiceQty(inv))}</td>
      <td><div class="milestones">${sched.map(p=>stageMilestone(inv,p)).join('')}</div>${linked.length?`<div class="payment-link">+ ${linked.length} ${ruPlural(linked.length,'дополнительный платёж','дополнительных платежа','дополнительных платежей')} привязано к счёту</div>`:''}</td>
      <td class="num">${balanceMarkup(summary.balance)}</td>
      <td class="date-cell"><span class="pill stock">${fmtDate(p3.date)}</span></td><td class="num mono stock-positive">+${fmtInt(totalInvoiceQty(inv))}</td>
      <td><div class="actions"><button class="icon-btn" type="button" data-add-payment-invoice="${inv.id}" aria-label="Добавить платёж к счёту №${escapeHtml(inv.number)}">₽</button><button class="icon-btn" type="button" data-edit="${inv.id}" aria-label="Изменить счёт №${escapeHtml(inv.number)}">✎</button><button class="icon-btn danger" type="button" data-delete="${inv.id}" aria-label="Удалить счёт №${escapeHtml(inv.number)}">×</button></div></td>`;
    body.appendChild(tr);
    const detail=document.createElement('tr'); detail.className='detail-row'; detail.id=`detail-${inv.id}`;
    const linkedList=linked.length?linked.sort((a,b)=>parseDate(a.date)-parseDate(b.date)).map(p=>`${fmtDate(parseDate(p.date))}: ${fmtMoney(p.amount)} · ${escapeHtml(p.label)}`).join('<br>'):'нет';
    detail.innerHTML=`<td colspan="8"><div class="detail-box"><div class="detail-grid"><div class="sku-list">${skuCatalog.map(s=>`<div class="sku-line"><span class="mono">${s.article}</span><span>${escapeHtml(s.label)}</span><span class="qty">${fmtInt(inv.items?.[s.article]||0)} шт.</span></div>`).join('')}</div><div class="detail-note"><b>Источник данных</b><br>${escapeHtml(inv.sourceNote||'Счёт введён вручную в приложении.')}<br><br><b>Итого по строкам:</b> ${fmtInt(totalInvoiceQty(inv))} шт.<br><br><b>Дополнительные платежи:</b><br>${linkedList}</div></div></div></td>`;
    body.appendChild(detail);
  });
  bindStageEditors(body);
  body.querySelectorAll('[data-expand]').forEach(btn=>btn.addEventListener('click',()=>{
    const row=$(`detail-${btn.dataset.expand}`); const open=!row.classList.contains('open'); row.classList.toggle('open',open); btn.setAttribute('aria-expanded',String(open)); btn.textContent=open?'−':'＋';
  }));
  body.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>openInvoiceDialog(btn.dataset.edit)));
  body.querySelectorAll('[data-add-payment-invoice]').forEach(btn=>btn.addEventListener('click',()=>openPaymentDialog(null,btn.dataset.addPaymentInvoice)));
  body.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{
    const inv=state.invoices.find(x=>x.id===btn.dataset.delete); if(!inv)return;
    const linkedCount=state.manualPayments.filter(p=>p.invoiceId===inv.id).length;
    openConfirm('Удалить счёт?',`Будет удалён <span class="confirm-object">счёт от ${fmtDate(parseDate(inv.date))} №${escapeHtml(inv.number)}</span>, его автоматические этапы, ${linkedCount} ${ruPlural(linkedCount,'привязанный дополнительный платёж','привязанных дополнительных платежа','привязанных дополнительных платежей')} и приход ${fmtInt(totalInvoiceQty(inv))} шт. Это изменит план продаж и денежный поток.`,'Удалить счёт',()=>{
      state.invoices=state.invoices.filter(x=>x.id!==inv.id); Object.keys(state.paymentOverrides).filter(k=>k.startsWith(inv.id+':')).forEach(k=>delete state.paymentOverrides[k]); state.manualPayments=state.manualPayments.filter(p=>p.invoiceId!==inv.id); saveState('Счёт удалён'); renderAll(); setStatus('Счёт удалён, будущие платежи и план продаж пересчитаны.','success');
    });
  }));
}
function bindStageEditors(root){
  root.querySelectorAll('[data-stage-override]').forEach(inp=>inp.addEventListener('change',()=>{
    const value=Math.max(0,Number(inp.value||0)); state.paymentOverrides[inp.dataset.stageOverride]=money2(value); saveState('Сумма этапа изменена'); renderAll(); setStatus('Сумма изменена. Более поздние автоматические платежи этого счёта пересчитаны.','success');
  }));
  root.querySelectorAll('[data-reset-stage]').forEach(btn=>btn.addEventListener('click',()=>{
    delete state.paymentOverrides[btn.dataset.resetStage]; saveState('Автоматический расчёт восстановлен'); renderAll(); setStatus('Ручная сумма снята. Более поздние платежи пересчитаны.','success');
  }));
}
function renderPayments(model){
  const body=$('paymentsBody'); body.innerHTML='';
  model.payments.forEach(p=>{
    const historical=p.date<model.start, noSales=model.periods.every(x=>x.payout>p.date), isStage=p.kind==='stage';
    const tr=document.createElement('tr'); tr.className=(historical?'row-history ':'')+(p.stock?'row-stock ':'')+(p.kind==='manual'?'row-manual ':'')+(noSales&&!historical?'row-gap':'');
    const inv=p.invoiceId?state.invoices.find(x=>x.id===p.invoiceId):null;
    const invoiceCell=inv?`<div class="invoice-date">${fmtDate(parseDate(inv.date))}</div><div class="invoice-no">№${escapeHtml(inv.number)}</div>`:'<span class="pill extra">без счёта</span>';
    const input=isStage?`<div class="override-wrap"><input class="amount-input" type="number" min="0" step="0.01" value="${p.used}" data-stage-override="${p.id}" aria-label="Текущий платёж ${p.label} по счёту №${escapeHtml(p.invoiceNumber)}"><button class="reset-override" type="button" data-reset-stage="${p.id}" ${p.manualOverride?'':'hidden'} aria-label="Вернуть автоматический расчёт этапа">↺</button></div>`:`<div class="override-wrap"><input class="amount-input" type="number" min="0" step="0.01" value="${p.used}" data-manual-amount="${p.manualPaymentId}" aria-label="Сумма дополнительного платежа"></div>`;
    const status=[historical?'<span class="pill history">до старта · история</span>':noSales?'<span class="pill gap">до первой выплаты</span>':'<span class="pill plan">участвует в плане</span>'];
    if(p.kind==='manual')status.push('<span class="pill extra">добавлен вручную</span>');
    if(p.manualOverride)status.push('<span class="pill manual">ручная сумма</span>');
    if(p.recalculated)status.push('<span class="pill recalc">пересчитан</span>');
    const actions=p.kind==='manual'?`<div class="actions"><button class="icon-btn" type="button" data-edit-payment="${p.manualPaymentId}" aria-label="Изменить дополнительный платёж">✎</button><button class="icon-btn danger" type="button" data-delete-payment="${p.manualPaymentId}" aria-label="Удалить дополнительный платёж">×</button></div>`:'—';
    tr.innerHTML=`<td class="date-cell mono">${fmtDate(p.date)}</td><td>${invoiceCell}</td><td>${escapeHtml(p.label)}</td><td class="num money">${isStage?fmtMoney(p.auto):'—'}</td>
      <td class="num">${input}</td><td class="num mono">${model.net>0?fmtInt(Math.ceil(p.used/model.net)):'—'}</td><td>${status.join(' ')}</td><td>${p.stock&&inv?`<span class="pill stock">+${fmtInt(totalInvoiceQty(inv))} шт.</span>`:'—'}</td><td>${actions}</td>`;
    body.appendChild(tr);
  });
  bindStageEditors(body);
  body.querySelectorAll('[data-manual-amount]').forEach(inp=>inp.addEventListener('change',()=>{
    const p=state.manualPayments.find(x=>x.id===inp.dataset.manualAmount); if(!p)return; p.amount=money2(Math.max(0,Number(inp.value||0))); saveState('Дополнительный платёж изменён'); renderAll(); setStatus(p.invoiceId?'Сумма дополнительного платежа изменена. Будущие этапы счёта пересчитаны.':'Сумма самостоятельного платежа изменена. План продаж пересчитан.','success');
  }));
  body.querySelectorAll('[data-edit-payment]').forEach(btn=>btn.addEventListener('click',()=>openPaymentDialog(btn.dataset.editPayment)));
  body.querySelectorAll('[data-delete-payment]').forEach(btn=>btn.addEventListener('click',()=>deleteManualPayment(btn.dataset.deletePayment)));
}
function renderSales(model){
  const body=$('salesBody'); body.innerHTML='';
  model.periods.forEach(p=>{
    const total=p.actual+p.plan, money=total*model.net, negative=p.stockBalance<0;
    const comment=negative?'<span class="pill gap">не хватает товара</span>':p.plan>0?'<span class="pill plan">нужно для платежей</span>':p.actual>0?'<span class="pill history">введён факт</span>':'—';
    const tr=document.createElement('tr'); if(negative)tr.className='row-overstock';
    tr.innerHTML=`<td class="date-cell">${fmtDate(p.start)}–${fmtDate(p.end)}</td><td class="date-cell mono">${fmtDate(p.payout)}</td><td class="num"><input class="actual-input" type="number" min="0" step="1" value="${p.actual}" data-actual="${p.key}" aria-label="Фактические продажи за период с ${fmtDate(p.start)}"></td><td class="num mono"><b>${fmtInt(p.plan)}</b></td><td class="num mono"><b>${fmtInt(total)}</b></td><td class="num money">${fmtMoney(money)}</td><td class="num mono ${negative?'stock-negative':'stock-positive'}">${fmtInt(p.stockBalance)}</td><td>${comment}</td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-actual]').forEach(inp=>inp.addEventListener('change',()=>{ state.actualSales[inp.dataset.actual]=Math.max(0,Math.floor(Number(inp.value||0))); saveState('Факт продаж сохранён'); renderAll(); }));
}
function formatMix(items){ return skuCatalog.filter(s=>Number(items?.[s.article]||0)>0).map(s=>`${s.article}: ${fmtInt(items[s.article])}`).join(' · ') || '—'; }
function renderStock(model){
  const eBody=$('stockEventsBody'); eBody.innerHTML='';
  stockEvents().forEach(e=>{ const tr=document.createElement('tr'); const hist=e.date<model.start; if(hist)tr.className='row-history'; tr.innerHTML=`<td class="mono date-cell">${fmtDate(e.date)}</td><td><div class="invoice-date">${fmtDate(parseDate(e.invoiceDate))}</div><div class="invoice-no">№${escapeHtml(e.invoiceNumber)}</div></td><td class="num mono stock-positive">+${fmtInt(e.qty)}</td><td class="stock-mix">${escapeHtml(formatMix(e.items))}</td><td>${hist?'<span class="pill history">в стартовом остатке</span>':'<span class="pill stock">будущий приход</span>'}</td>`; eBody.appendChild(tr); });
  const sBody=$('skuStockBody'); sBody.innerHTML='';
  skuCatalog.forEach(s=>{
    let before=0,after=0; stockEvents().forEach(e=>{const q=Number(e.items?.[s.article]||0); if(e.date<=model.start)before+=q;else after+=q;});
    const tr=document.createElement('tr'); tr.innerHTML=`<td class="mono"><b>${s.article}</b></td><td>${escapeHtml(s.label)}</td><td class="num mono">${fmtInt(before)}</td><td class="num mono">${fmtInt(after)}</td><td class="num mono"><b>${fmtInt(before+after)}</b></td>`; sBody.appendChild(tr);
  });
}
function renderCash(model){
  const body=$('cashBody'); body.innerHTML='';
  model.cashEvents.forEach(e=>{ const tr=document.createElement('tr'); if(e.external>0)tr.className='row-gap'; tr.innerHTML=`<td class="mono date-cell">${fmtDate(e.date)}</td><td>${escapeHtml(e.label)}</td><td class="num money">${e.inflow?fmtMoney(e.inflow):'—'}</td><td class="num money">${e.outflow?fmtMoney(e.outflow):'—'}</td><td class="num money">${e.external?`<span class="stock-negative">${fmtMoney(e.external)}</span>`:'—'}</td><td class="num money">${fmtMoney(e.balance)}</td>`; body.appendChild(tr); });
}
function renderMonth(model){
  const body=$('monthBody'); body.innerHTML=''; let count=0;
  Object.keys(model.monthly).sort().forEach(k=>{ const v=model.monthly[k]; if(v.actual+v.plan===0)return; count++; const tr=document.createElement('tr'); tr.innerHTML=`<td>${monthLabel(k)}</td><td class="num mono">${fmtInt(v.actual)}</td><td class="num mono">${fmtInt(v.plan)}</td><td class="num mono"><b>${fmtInt(v.actual+v.plan)}</b></td><td class="num money">${fmtMoney(v.salesMoney)}</td>`; body.appendChild(tr); });
  if(!count){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="5" style="padding:18px;color:var(--muted);text-align:center">По текущим платежам продаж до доступных дат выплат пока нет: платежи раньше первой выплаты попадают во внешнее финансирование.</td>'; body.appendChild(tr); }
}
function chartColors(){ const cs=getComputedStyle(document.documentElement); return {plan:cs.getPropertyValue('--cobalt').trim(),actual:'#7FAAE8',stock:cs.getPropertyValue('--stock').trim(),pay:cs.getPropertyValue('--warning').trim(),inflow:cs.getPropertyValue('--teal').trim(),grid:'#E3E8EE',text:'#68748A'}; }
function setupCanvas(canvas){ const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(520,r.width),h=Math.max(280,r.height);canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return {ctx,w,h}; }
function drawSalesChart(model){
  const {ctx,w,h}=setupCanvas($('salesChart')),c=chartColors(),L=50,R=52,T=18,B=40,cw=w-L-R,ch=h-T-B,ps=model.periods;
  const rawMaxUnits=Math.max(0,...ps.map(p=>p.actual+p.plan)), unitScale=Math.max(1,rawMaxUnits); const maxStock=Math.max(1,...ps.map(p=>Math.max(0,p.stockBalance)));
  ctx.font='10px Aptos, Segoe UI, sans-serif';ctx.strokeStyle=c.grid;ctx.fillStyle=c.text;ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=T+ch-ch*i/4;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(fmtInt(rawMaxUnits?rawMaxUnits*i/4:0),L-7,y+3);ctx.textAlign='left';ctx.fillText(fmtInt(maxStock*i/4),w-R+6,y+3);}
  const gw=cw/Math.max(1,ps.length),bw=Math.max(3,Math.min(14,gw*.56));
  ps.forEach((p,i)=>{let x=L+i*gw+gw/2-bw/2;let base=T+ch;let ah=ch*(p.actual/unitScale),ph=ch*(p.plan/unitScale);ctx.fillStyle=c.actual;ctx.fillRect(x,base-ah,bw,ah);ctx.fillStyle=c.plan;ctx.fillRect(x,base-ah-ph,bw,ph);});
  ctx.strokeStyle=c.stock;ctx.lineWidth=2;ctx.beginPath();ps.forEach((p,i)=>{const x=L+i*gw+gw/2,y=T+ch-ch*(Math.max(0,p.stockBalance)/maxStock);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
  ctx.fillStyle=c.text;ctx.textAlign='center';const step=Math.max(1,Math.ceil(ps.length/8));ps.forEach((p,i)=>{if(i%step===0)ctx.fillText(`${pad(p.start.getDate())}.${pad(p.start.getMonth()+1)}`,L+i*gw+gw/2,h-14);});
}
function drawMoneyChart(model){
  const {ctx,w,h}=setupCanvas($('moneyChart')),c=chartColors(),keys=Object.keys(model.monthly).sort(),L=58,R=16,T=18,B=42,cw=w-L-R,ch=h-T-B;
  const max=Math.max(1,...keys.flatMap(k=>[model.monthly[k].payments,model.monthly[k].inflows]));ctx.font='10px Aptos, Segoe UI, sans-serif';ctx.strokeStyle=c.grid;ctx.fillStyle=c.text;
  for(let i=0;i<=4;i++){const y=T+ch-ch*i/4;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(moneyShort(max*i/4),L-7,y+3);}
  const gw=cw/Math.max(1,keys.length),bw=Math.min(22,gw*.28);keys.forEach((k,i)=>{const x=L+i*gw+gw/2;const a=model.monthly[k].payments,b=model.monthly[k].inflows;ctx.fillStyle=c.pay;ctx.fillRect(x-bw-2,T+ch-ch*a/max,bw,ch*a/max);ctx.fillStyle=c.inflow;ctx.fillRect(x+2,T+ch-ch*b/max,bw,ch*b/max);ctx.fillStyle=c.text;ctx.textAlign='center';ctx.fillText(monthLabel(k),x,h-14);});
}
function renderCharts(model){ requestAnimationFrame(()=>{drawSalesChart(model);drawMoneyChart(model);}); }
function renderAll(){
  readSettings(); saveState(); writeSettings(); renderTerms(); const model=computeModel(); renderAlerts(model);renderKpis(model);renderInvoices();renderPayments(model);renderSales(model);renderStock(model);renderCash(model);renderMonth(model);renderCharts(model);
}

function openInvoiceDialog(id=null){
  editingInvoiceId=id; const inv=id?state.invoices.find(x=>x.id===id):null;
  $('invoiceDialogTitle').textContent=inv?'Изменить счёт':'Добавить счёт'; $('invoiceFormError').textContent='';
  $('invoiceNumber').value=inv?.number||''; $('invoiceDate').value=inv?.date||state.settings.modelStart; $('invoiceTotal').value=inv?.total||'';
  skuCatalog.forEach(s=>{const el=$(`qty-${s.article}`);el.value=inv?.items?.[s.article]||0;}); updateInvoiceQtyTotal();
  $('invoiceDialog').showModal(); requestAnimationFrame(()=>$('invoiceNumber').focus());
}
function updateInvoiceQtyTotal(){ const total=skuCatalog.reduce((a,s)=>a+Math.max(0,Number($(`qty-${s.article}`).value||0)),0); $('invoiceQtyTotal').value=fmtInt(total); }
function paymentInvoiceOptions(selected=''){
  const list=[...state.invoices].sort((a,b)=>parseDate(a.date)-parseDate(b.date));
  $('paymentInvoice').innerHTML='<option value="">Без привязки к счёту</option>'+list.map(inv=>`<option value="${inv.id}" ${inv.id===selected?'selected':''}>${fmtDate(parseDate(inv.date))} · №${escapeHtml(inv.number)}</option>`).join('');
}
function updatePaymentHelp(){
  const inv=state.invoices.find(x=>x.id===$('paymentInvoice').value);
  $('paymentHelp').innerHTML=inv?`Платёж будет привязан к <b>счёту ${fmtDate(parseDate(inv.date))} №${escapeHtml(inv.number)}</b>. Его сумма уменьшит только более поздние автоматические этапы этого счёта. Уже более ранние платежи не меняются.`:'Самостоятельный платёж войдёт в общий денежный поток и план продаж, но не будет менять график 30 / 30 / 40 какого-либо счёта.';
}
function openPaymentDialog(id=null,preselectedInvoiceId=''){
  editingPaymentId=id; const p=id?state.manualPayments.find(x=>x.id===id):null;
  $('paymentDialogTitle').textContent=p?'Изменить платёж':'Добавить платёж'; $('paymentFormError').textContent='';
  paymentInvoiceOptions(p?.invoiceId||preselectedInvoiceId||'');
  $('paymentDate').value=p?.date||state.settings.modelStart;
  $('paymentAmount').value=p?.amount||'';
  $('paymentLabel').value=p?.label||'Дополнительный платёж';
  updatePaymentHelp(); $('paymentDialog').showModal(); requestAnimationFrame(()=>$('paymentDate').focus());
}
function deleteManualPayment(id){
  const p=state.manualPayments.find(x=>x.id===id); if(!p)return;
  const inv=p.invoiceId?state.invoices.find(x=>x.id===p.invoiceId):null;
  const object=inv?`${fmtDate(parseDate(p.date))} · ${fmtMoney(p.amount)} по счёту №${escapeHtml(inv.number)}`:`${fmtDate(parseDate(p.date))} · ${fmtMoney(p.amount)} без привязки к счёту`;
  openConfirm('Удалить платёж?',`Будет удалён <span class="confirm-object">${object}</span>. ${inv?'Будущие автоматические платежи счёта будут пересчитаны.':'Общий план продаж и денежный поток будут пересчитаны.'}`,'Удалить платёж',()=>{
    state.manualPayments=state.manualPayments.filter(x=>x.id!==id); saveState('Платёж удалён'); renderAll(); setStatus(inv?'Платёж удалён. Будущие этапы счёта пересчитаны.':'Платёж удалён. План продаж пересчитан.','success');
  });
}
function openConfirm(title,description,actionLabel,callback){ confirmCallback=callback;$('confirmTitle').textContent=title;$('confirmDescription').innerHTML=description;$('confirmActionBtn').textContent=actionLabel;$('confirmDialog').showModal();requestAnimationFrame(()=>$('confirmCancelBtn').focus()); }

function downloadText(filename,text,type='text/plain;charset=utf-8'){
  const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
}
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
function exportPayments(){
  const m=computeModel();
  const rows=[['Дата','Дата счета','№ счета','Тип','Этап','База, руб.','Текущий платеж, руб.','Приход, шт.','Статус']];
  m.payments.forEach(p=>rows.push([fmtDate(p.date),p.invoiceDate?fmtDate(parseDate(p.invoiceDate)):'',p.invoiceNumber||'',p.kind==='manual'?'Дополнительный':'Автоматический',p.label,p.auto??'',p.used,p.qty,p.date<m.start?'История':p.recalculated?'Пересчитан':p.manualOverride?'Ручная сумма':'План']));
  downloadText('payment_calendar.csv','\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');setStatus('CSV платежей подготовлен.','success');
}
function exportSales(){ const m=computeModel(); const rows=[['Период','Дата выплаты','Факт, шт.','Доп. план, шт.','Всего, шт.','Поступление, руб.','Остаток, шт.']];m.periods.forEach(p=>rows.push([`${fmtDate(p.start)}–${fmtDate(p.end)}`,fmtDate(p.payout),p.actual,p.plan,p.actual+p.plan,(p.actual+p.plan)*m.net,p.stockBalance]));downloadText('sales_plan.csv','\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');setStatus('CSV продаж подготовлен.','success');}

function buildSkuEditor(){ $('skuEditorRows').innerHTML=skuCatalog.map(s=>`<div class="sku-edit-row"><span class="article">${s.article}</span><label for="qty-${s.article}">${escapeHtml(s.label)}</label><input id="qty-${s.article}" type="number" min="0" step="1" value="0" aria-label="Количество ${escapeHtml(s.label)}"></div>`).join(''); skuCatalog.forEach(s=>$(`qty-${s.article}`).addEventListener('input',updateInvoiceQtyTotal)); }
function initTabs(){
  const labels={invoices:'Счета',payments:'Платежи',sales:'План продаж',stock:'Остатки',dashboard:'Графики'};
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  function activate(name,focus=false){ if(!labels[name])name='invoices';tabs.forEach(t=>{const active=t.dataset.tab===name;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;$(`panel-${t.dataset.tab}`).classList.toggle('active',active);});const url=new URL(location.href);url.searchParams.set('tab',name);history.replaceState(null,'',url);document.title=`${labels[name]} — Платёжный календарь смесителей`;if(focus)document.querySelector(`[data-tab="${name}"]`).focus();if(name==='dashboard')renderCharts(computeModel());}
  tabs.forEach((t,i)=>{t.addEventListener('click',()=>activate(t.dataset.tab));t.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();let ni=i;if(e.key==='ArrowRight')ni=(i+1)%tabs.length;if(e.key==='ArrowLeft')ni=(i-1+tabs.length)%tabs.length;if(e.key==='Home')ni=0;if(e.key==='End')ni=tabs.length-1;activate(tabs[ni].dataset.tab,true);});});
  activate(new URL(location.href).searchParams.get('tab')||'invoices');
}

buildSkuEditor(); writeSettings();
['modelStart','horizonMonths','unitCost','multiplier','startingCash','periodDays','payoutLagMonths','openingStockCorrection','p1Pct','p2Days','p2Pct','p3Months','p3Pct'].forEach(id=>$(id).addEventListener('change',()=>{readSettings();saveState('Параметры сохранены');renderAll();setStatus('Параметры изменены. Все будущие расчёты обновлены.','success');}));
$('addInvoiceBtn').addEventListener('click',()=>openInvoiceDialog()); $('addInvoiceBtn2').addEventListener('click',()=>openInvoiceDialog());
$('addPaymentBtn').addEventListener('click',()=>openPaymentDialog()); $('addPaymentBtn2').addEventListener('click',()=>openPaymentDialog());
$('invoiceCancelBtn').addEventListener('click',()=>$('invoiceDialog').close());
$('paymentCancelBtn').addEventListener('click',()=>$('paymentDialog').close());
$('paymentInvoice').addEventListener('change',updatePaymentHelp);
$('invoiceForm').addEventListener('submit',e=>{
  e.preventDefault(); const number=$('invoiceNumber').value.trim(),date=$('invoiceDate').value,total=Number($('invoiceTotal').value||0); const items={};skuCatalog.forEach(s=>items[s.article]=Math.max(0,Math.floor(Number($(`qty-${s.article}`).value||0)))); const qty=Object.values(items).reduce((a,b)=>a+b,0);
  const errs=[];if(!number)errs.push('укажите № счёта');if(!date)errs.push('укажите дату счёта');if(!(total>0))errs.push('сумма счёта должна быть больше 0');if(qty<=0)errs.push('укажите количество хотя бы по одному SKU');
  if(errs.length){$('invoiceFormError').textContent='Проверьте данные: '+errs.join('; ')+'.';const first=!number?$('invoiceNumber'):!date?$('invoiceDate'):!(total>0)?$('invoiceTotal'):$('qty-310701');first.setAttribute('aria-invalid','true');first.focus();return;}
  ['invoiceNumber','invoiceDate','invoiceTotal',...skuCatalog.map(s=>`qty-${s.article}`)].forEach(id=>$(id).removeAttribute('aria-invalid'));
  if(editingInvoiceId){const inv=state.invoices.find(x=>x.id===editingInvoiceId);Object.assign(inv,{number,date,total,items});saveState('Счёт изменён');setStatus('Счёт изменён. Его платежи, приход и будущий план продаж пересчитаны.','success');}
  else{state.invoices.push({id:uid(),number,date,total,items,sourceNote:'Счёт введён вручную в приложении.'});saveState('Счёт добавлен');setStatus('Счёт добавлен. Создан график платежей и приход товара.','success');}
  $('invoiceDialog').close();renderAll();
});
$('paymentForm').addEventListener('submit',e=>{
  e.preventDefault(); const invoiceId=$('paymentInvoice').value,date=$('paymentDate').value,amount=Number($('paymentAmount').value||0),label=$('paymentLabel').value.trim()||'Дополнительный платёж';
  const errs=[];if(!date)errs.push('укажите дату платежа');if(!(amount>0))errs.push('сумма должна быть больше 0');if(invoiceId&&!state.invoices.some(inv=>inv.id===invoiceId))errs.push('выбранный счёт не найден');
  if(errs.length){$('paymentFormError').textContent='Проверьте данные: '+errs.join('; ')+'.';const first=!date?$('paymentDate'):!(amount>0)?$('paymentAmount'):$('paymentInvoice');first.setAttribute('aria-invalid','true');first.focus();return;}
  ['paymentInvoice','paymentDate','paymentAmount','paymentLabel'].forEach(id=>$(id).removeAttribute('aria-invalid'));
  if(editingPaymentId){const p=state.manualPayments.find(x=>x.id===editingPaymentId);Object.assign(p,{invoiceId,date,amount:money2(amount),label});saveState('Платёж изменён');}
  else{state.manualPayments.push({id:uid(),invoiceId,date,amount:money2(amount),label,createdAt:Date.now()});saveState('Платёж добавлен');}
  $('paymentDialog').close();renderAll();setStatus(invoiceId?'Платёж сохранён. Более поздние автоматические этапы выбранного счёта пересчитаны.':'Самостоятельный платёж сохранён. Общий план продаж пересчитан.','success');
});
$('confirmDialog').addEventListener('close',()=>{if($('confirmDialog').returnValue==='default'&&confirmCallback){const cb=confirmCallback;confirmCallback=null;cb();}else confirmCallback=null;});
$('exportJsonBtn').addEventListener('click',()=>{downloadText('volmax_mixer_cashflow.json',JSON.stringify(state,null,2),'application/json;charset=utf-8');setStatus('JSON модели подготовлен.','success');});
$('importJsonBtn').addEventListener('click',()=>{$('jsonFile').click();});
$('jsonFile').addEventListener('change',async()=>{const f=$('jsonFile').files[0];if(!f)return;try{const incoming=JSON.parse(await f.text());state=normalizeState(incoming);writeSettings();saveState('Импортировано');renderAll();setStatus('Модель импортирована из JSON.','success');}catch(err){setStatus('Импорт не выполнен: '+err.message+'. Текущие данные сохранены.','error');}$('jsonFile').value='';});
$('exportPaymentsBtn').addEventListener('click',exportPayments);$('exportSalesBtn').addEventListener('click',exportSales);$('printBtn').addEventListener('click',()=>window.print());
$('resetBtn').addEventListener('click',()=>openConfirm('Сбросить модель?',`Будут удалены все ручные изменения, дополнительные платежи, фактические продажи и добавленные счета. Вернутся два исходных счёта и условия 30/30/40.`,'Сбросить модель',()=>{state=defaultState();writeSettings();saveState('Модель сброшена');renderAll();setStatus('Исходные данные восстановлены.','success');}));
window.addEventListener('resize',()=>{const active=document.querySelector('.panel.active');if(active?.id==='panel-dashboard')renderCharts(computeModel());});
initTabs();renderAll();
})();
