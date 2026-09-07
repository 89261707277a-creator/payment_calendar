from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
app = root / "app.js"
index = root / "index.html"


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label):
    out, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"regex replacement count {count} for {label}")
    return out


s = app.read_text(encoding="utf-8")
s = replace_once(s, "  version:5,", "  version:6,", "default version")
s = replace_once(s, "  raw.version=5;", "  raw.version=6;", "normalized version")
s = replace_once(
    s,
    "  paymentDateOverrides:{},\n  manualPayments:[],",
    "  paymentDateOverrides:{},\n  stockDateOverrides:{},\n  manualPayments:[],",
    "default stock override state",
)
s = replace_once(
    s,
    "  raw.paymentDateOverrides ||= {};\n  raw.manualPayments ||= [];",
    "  raw.paymentDateOverrides ||= {};\n  raw.stockDateOverrides ||= {};\n  raw.manualPayments ||= [];",
    "normalize stock override state",
)

new_stock_events = r'''function stockEvents(){
  return state.invoices.map(inv=>{
    const p3=baseStages(inv).find(x=>x.stage==='p3');
    const dateManualOverride=hasOwn(state.stockDateOverrides,inv.id);
    const autoDate=new Date(p3.date);
    const date=dateManualOverride?parseDate(state.stockDateOverrides[inv.id]):new Date(autoDate);
    return {date,autoDate,dateManualOverride,paymentDate:p3.date,invoiceId:inv.id,invoiceNumber:inv.number,invoiceDate:inv.date,qty:totalInvoiceQty(inv),items:{...inv.items}};
  }).sort((a,b)=>a.date-b.date);
}
'''
s = regex_once(s, r"function stockEvents\(\)\{.*?\n\}\n(?=function makePeriods)", new_stock_events, "stockEvents")

s = replace_once(
    s,
    "  $('railMonths').textContent=`+${fmtInt(state.settings.p3Months)} ${ruPlural(state.settings.p3Months,'месяц','месяца','месяцев')} · приход`;",
    "  $('railMonths').textContent=`+${fmtInt(state.settings.p3Months)} ${ruPlural(state.settings.p3Months,'месяц','месяца','месяцев')} · 40%`;",
    "rail final label",
)
s = replace_once(
    s,
    "Проверьте фактические продажи, дату прихода финального платежа или корректировку остатка на старте.",
    "Проверьте фактические продажи, дату прихода товара или корректировку остатка на старте.",
    "stock warning copy",
)
s = replace_once(
    s,
    "<b>${fmtNumber(p.pct)}%${p.stock?' · приход':''}</b>",
    "<b>${fmtNumber(p.pct)}%${p.stock?' · финал':''}</b>",
    "final milestone copy",
)

helpers = r'''function arrivalEditor(inv,e){
  if(!inv||!e)return '—';
  const meta=e.dateManualOverride?`ручная дата · база по 40% ${fmtDate(e.autoDate)}`:`по текущей дате 40% ${fmtDate(e.autoDate)}`;
  return `<div class="arrival-edit"><div class="date-edit-wrap"><input class="date-input arrival-date-input" type="date" value="${iso(e.date)}" data-arrival-date="${inv.id}" aria-label="Дата прихода товара по счёту №${escapeHtml(inv.number)}"><button class="reset-override" type="button" data-reset-arrival-date="${inv.id}" ${e.dateManualOverride?'':'hidden'} aria-label="Снова связать дату прихода с датой 40%">↺</button></div><div class="cell-meta">${escapeHtml(meta)}</div></div>`;
}
function linkedArrivalMarkup(inv){
  if(!inv)return '—';
  const e=stockEvents().find(x=>x.invoiceId===inv.id); if(!e)return '—';
  return `<span class="pill stock">+${fmtInt(e.qty)} шт. · ${fmtDate(e.date)}</span>${e.dateManualOverride?' <span class="pill manual-date">ручная дата прихода</span>':''}`;
}
'''
s = replace_once(s, "function renderInvoices(){", helpers + "function renderInvoices(){", "arrival helpers")

new_render_invoices = r'''function renderInvoices(){
  const body=$('invoiceBody'); body.innerHTML='';
  [...state.invoices].sort((a,b)=>parseDate(a.date)-parseDate(b.date)).forEach(inv=>{
    const summary=invoiceSchedule(inv), sched=summary.stages;
    const arrival=stockEvents().find(e=>e.invoiceId===inv.id);
    const linked=state.manualPayments.filter(p=>p.invoiceId===inv.id);
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><div class="invoice-identity"><button class="icon-btn" type="button" data-expand="${inv.id}" aria-expanded="false" aria-label="Показать состав счёта №${escapeHtml(inv.number)}">＋</button><div><div class="invoice-date">${fmtDate(parseDate(inv.date))}</div><div class="invoice-no">счёт №${escapeHtml(inv.number)}</div></div></div></td>
      <td class="num money">${fmtMoney(inv.total)}</td><td class="num mono">${fmtInt(totalInvoiceQty(inv))}</td>
      <td><div class="milestones">${sched.map(p=>stageMilestone(inv,p)).join('')}</div>${linked.length?`<div class="payment-link">+ ${linked.length} ${ruPlural(linked.length,'дополнительный платёж','дополнительных платежа','дополнительных платежей')} привязано к счёту</div>`:''}</td>
      <td class="num">${balanceMarkup(summary.balance)}</td>
      <td>${arrivalEditor(inv,arrival)}</td><td class="num mono stock-positive">+${fmtInt(totalInvoiceQty(inv))}</td>
      <td><div class="actions"><button class="icon-btn" type="button" data-add-payment-invoice="${inv.id}" aria-label="Добавить платёж к счёту №${escapeHtml(inv.number)}">₽</button><button class="icon-btn" type="button" data-edit="${inv.id}" aria-label="Изменить счёт №${escapeHtml(inv.number)}">✎</button><button class="icon-btn danger" type="button" data-delete="${inv.id}" aria-label="Удалить счёт №${escapeHtml(inv.number)}">×</button></div></td>`;
    body.appendChild(tr);
    const detail=document.createElement('tr'); detail.className='detail-row'; detail.id=`detail-${inv.id}`;
    const linkedList=linked.length?linked.sort((a,b)=>parseDate(a.date)-parseDate(b.date)).map(p=>`${fmtDate(parseDate(p.date))}: ${fmtMoney(p.amount)} · ${escapeHtml(p.label)}`).join('<br>'):'нет';
    detail.innerHTML=`<td colspan="8"><div class="detail-box"><div class="detail-grid"><div class="sku-list">${skuCatalog.map(s=>`<div class="sku-line"><span class="mono">${s.article}</span><span>${escapeHtml(s.label)}</span><span class="qty">${fmtInt(inv.items?.[s.article]||0)} шт.</span></div>`).join('')}</div><div class="detail-note"><b>Источник данных</b><br>${escapeHtml(inv.sourceNote||'Счёт введён вручную в приложении.')}<br><br><b>Итого по строкам:</b> ${fmtInt(totalInvoiceQty(inv))} шт.<br><br><b>Дополнительные платежи:</b><br>${linkedList}</div></div></div></td>`;
    body.appendChild(detail);
  });
  bindStageEditors(body);
  bindArrivalEditors(body);
  body.querySelectorAll('[data-expand]').forEach(btn=>btn.addEventListener('click',()=>{
    const row=$(`detail-${btn.dataset.expand}`); const open=!row.classList.contains('open'); row.classList.toggle('open',open); btn.setAttribute('aria-expanded',String(open)); btn.textContent=open?'−':'＋';
  }));
  body.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>openInvoiceDialog(btn.dataset.edit)));
  body.querySelectorAll('[data-add-payment-invoice]').forEach(btn=>btn.addEventListener('click',()=>openPaymentDialog(null,btn.dataset.addPaymentInvoice)));
  body.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{
    const inv=state.invoices.find(x=>x.id===btn.dataset.delete); if(!inv)return;
    const linkedCount=state.manualPayments.filter(p=>p.invoiceId===inv.id).length;
    openConfirm('Удалить счёт?',`Будет удалён <span class="confirm-object">счёт от ${fmtDate(parseDate(inv.date))} №${escapeHtml(inv.number)}</span>, его автоматические этапы, ${linkedCount} ${ruPlural(linkedCount,'привязанный дополнительный платёж','привязанных дополнительных платежа','привязанных дополнительных платежей')} и приход ${fmtInt(totalInvoiceQty(inv))} шт. Это изменит план продаж и денежный поток.`,'Удалить счёт',()=>{
      state.invoices=state.invoices.filter(x=>x.id!==inv.id); Object.keys(state.paymentOverrides).filter(k=>k.startsWith(inv.id+':')).forEach(k=>delete state.paymentOverrides[k]); Object.keys(state.paymentDateOverrides).filter(k=>k.startsWith(inv.id+':')).forEach(k=>delete state.paymentDateOverrides[k]); delete state.stockDateOverrides[inv.id]; state.manualPayments=state.manualPayments.filter(p=>p.invoiceId!==inv.id); saveState('Счёт удалён'); renderAll(); setStatus('Счёт удалён, будущие платежи, приходы и план продаж пересчитаны.','success');
    });
  }));
}
'''
s = regex_once(s, r"function renderInvoices\(\)\{.*?\n\}\n(?=function bindStageEditors)", new_render_invoices, "renderInvoices")

arrival_binder = r'''function bindArrivalEditors(root){
  root.querySelectorAll('[data-arrival-date]').forEach(inp=>inp.addEventListener('change',()=>{
    const invoiceId=inp.dataset.arrivalDate, value=inp.value, inv=state.invoices.find(x=>x.id===invoiceId);
    if(!inv || !value){ renderAll(); setStatus('Дата прихода не изменена: укажите корректную дату.','error'); return; }
    state.stockDateOverrides[invoiceId]=value;
    saveState('Дата прихода изменена'); renderAll();
    setStatus('Дата прихода изменена отдельно от 40%. Остатки, доступный товар и план продаж пересчитаны.','success');
  }));
  root.querySelectorAll('[data-reset-arrival-date]').forEach(btn=>btn.addEventListener('click',()=>{
    const invoiceId=btn.dataset.resetArrivalDate; delete state.stockDateOverrides[invoiceId];
    saveState('Дата прихода снова связана с 40%'); renderAll();
    setStatus('Дата прихода снова равна текущей дате платежа 40%. Остатки и план продаж пересчитаны.','success');
  }));
}
'''
s = replace_once(s, "function renderPayments(model){", arrival_binder + "function renderPayments(model){", "arrival binder")

old_arrival_cell = "<td>${p.stock&&inv?`<span class=\"pill stock\">+${fmtInt(totalInvoiceQty(inv))} шт.</span>`:'—'}</td>"
new_arrival_cell = "<td>${p.stock&&inv?linkedArrivalMarkup(inv):'—'}</td>"
s = replace_once(s, old_arrival_cell, new_arrival_cell, "payment arrival cell")

new_render_stock = r'''function renderStock(model){
  const eBody=$('stockEventsBody'); eBody.innerHTML='';
  stockEvents().forEach(e=>{
    const tr=document.createElement('tr'), inv=state.invoices.find(x=>x.id===e.invoiceId), hist=e.date<model.start;
    if(hist)tr.className='row-history';
    tr.innerHTML=`<td>${arrivalEditor(inv,e)}</td><td><div class="invoice-date">${fmtDate(parseDate(e.invoiceDate))}</div><div class="invoice-no">№${escapeHtml(e.invoiceNumber)}</div></td><td class="num mono stock-positive">+${fmtInt(e.qty)}</td><td class="stock-mix">${escapeHtml(formatMix(e.items))}</td><td>${hist?'<span class="pill history">в стартовом остатке</span>':'<span class="pill stock">будущий приход</span>'}${e.dateManualOverride?' <span class="pill manual-date">ручная дата</span>':''}</td>`;
    eBody.appendChild(tr);
  });
  bindArrivalEditors(eBody);
  const sBody=$('skuStockBody'); sBody.innerHTML='';
  skuCatalog.forEach(s=>{
    let before=0,after=0; stockEvents().forEach(e=>{const q=Number(e.items?.[s.article]||0); if(e.date<=model.start)before+=q;else after+=q;});
    const tr=document.createElement('tr'); tr.innerHTML=`<td class="mono"><b>${s.article}</b></td><td>${escapeHtml(s.label)}</td><td class="num mono">${fmtInt(before)}</td><td class="num mono">${fmtInt(after)}</td><td class="num mono"><b>${fmtInt(before+after)}</b></td>`; sBody.appendChild(tr);
  });
}
'''
s = regex_once(s, r"function renderStock\(model\)\{.*?\n\}\n(?=function renderCash)", new_render_stock, "renderStock")

s = replace_once(
    s,
    "Object.assign(inv,{number,date,total,items});saveState('Счёт изменён');setStatus('Счёт изменён. Его платежи, приход и будущий план продаж пересчитаны.','success');",
    "const arrivalFixed=hasOwn(state.stockDateOverrides,inv.id); Object.assign(inv,{number,date,total,items});saveState('Счёт изменён');setStatus(arrivalFixed?'Счёт изменён. Платежи пересчитаны; ручная дата прихода сохранена.':'Счёт изменён. Платежи, дата прихода и будущий план продаж пересчитаны.','success');",
    "invoice save status",
)

app.write_text(s, encoding="utf-8")

h = index.read_text(encoding="utf-8")
h = replace_once(h, "<p>Счёт задаёт график оплат и дату прихода товара. Модель от даты платежа назад считает, сколько смесителей нужно продать, чтобы деньги успели поступить.</p>", "<p>Счёт задаёт график оплат и базовую дату прихода товара. Реальную дату прихода можно изменить отдельно, а модель сразу пересчитает доступный остаток и нужный темп продаж.</p>", "hero copy")
h = replace_once(h, '<div class="rail-step stock-step"><div class="rail-pct" id="railPct3">40%</div><div class="rail-copy"><b id="railMonths">+2 месяца · приход</b><span>оплата и пополнение остатков</span></div></div>', '<div class="rail-step stock-step"><div class="rail-pct" id="railPct3">40%</div><div class="rail-copy"><b id="railMonths">+2 месяца · 40%</b><span>финальный платёж; приход по умолчанию</span></div></div>', "rail html")
h = replace_once(h, '<div class="assumption-note">40% считается от <b>даты счёта + указанное число календарных месяцев</b>. На эту же дату в модели приходит количество товара из строк счёта. Дату и сумму любого этапа можно изменить прямо в реестре счетов или в разделе «Платежи». Ручная дата фиксирует только выбранный этап; остальные даты сохраняют свои правила от даты счёта. После ручного изменения или дополнительного платежа остаток счёта автоматически перераспределяется только на более поздние автоматические этапы; уже более ранние этапы не меняются.</div>', '<div class="assumption-note">40% считается от <b>даты счёта + указанное число календарных месяцев</b>. По умолчанию дата прихода равна текущей дате 40%, но её можно изменить отдельно. После этого дата оплаты 40% и дата прихода живут независимо, пока вы не нажмёте ↺ у даты прихода. Дату и сумму любого этапа также можно менять вручную; все зависимые остатки, продажи и денежный поток пересчитываются сразу.</div>', "assumption copy")
h = replace_once(h, '<div class="card kpi" data-tone="stock"><div class="kpi-label">Остаток на старте</div><div class="kpi-value" id="kpiOpeningStock">—</div><div class="kpi-sub" id="kpiOpeningStockSub">по приходам 40% + корректировка</div></div>', '<div class="card kpi" data-tone="stock"><div class="kpi-label">Остаток на старте</div><div class="kpi-value" id="kpiOpeningStock">—</div><div class="kpi-sub" id="kpiOpeningStockSub">по датам прихода + корректировка</div></div>', "opening stock copy")
h = replace_once(h, '<div class="section-head"><div><h2>Реестр счетов</h2><p>Даты и суммы 30 / 30 / 40 редактируются прямо здесь. Изменение даты пересчитывает план продаж и денежный поток; изменение суммы пересчитывает более поздние автоматические платежи этого счёта.</p></div><button class="btn primary" type="button" id="addInvoiceBtn2">+ Добавить счёт</button></div>', '<div class="section-head"><div><h2>Реестр счетов</h2><p>Даты и суммы 30 / 30 / 40 и фактическая дата прихода редактируются прямо здесь. Дата прихода по умолчанию следует за 40%, но может быть зафиксирована отдельно.</p></div><button class="btn primary" type="button" id="addInvoiceBtn2">+ Добавить счёт</button></div>', "invoice section copy")
h = replace_once(h, '<div class="card section-card"><div class="section-head"><div><h2>Приходы товара</h2><p>Каждый приход происходит в текущую дату финального 40%-го платежа. Если дату 40% перенести вручную, приход товара переносится вместе с ней.</p></div></div><div class="table-wrap">', '<div class="card section-card"><div class="section-head"><div><h2>Приходы товара</h2><p>Дата прихода редактируется отдельно. Пока она не зафиксирована вручную, она автоматически следует за текущей датой финального платежа 40%.</p></div></div><div class="table-wrap">', "stock section copy")
index.write_text(h, encoding="utf-8")

print("v6 editable arrival date applied")
