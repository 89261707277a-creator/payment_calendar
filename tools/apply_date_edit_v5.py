from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = root / "app.js"
css = root / "styles.css"
index = root / "index.html"

s = app.read_text(encoding="utf-8")

s = s.replace("  version:4,", "  version:5,", 1)
s = s.replace("  raw.version=4;", "  raw.version=5;", 1)
s = s.replace("  paymentOverrides:{},\n  manualPayments:[],", "  paymentOverrides:{},\n  paymentDateOverrides:{},\n  manualPayments:[]")
s = s.replace("  raw.paymentOverrides ||= {};\n  raw.manualPayments ||= [];", "  raw.paymentOverrides ||= {};\n  raw.paymentDateOverrides ||= {};\n  raw.manualPayments ||= [];")

old = '''function baseStages(inv){
  const s=state.settings, d=parseDate(inv.date);
  return [
    {kind:'stage',stage:'p1',stageIndex:0,pct:Number(s.p1Pct),date:d,label:`${fmtNumber(s.p1Pct)}% · дата счёта`,stock:false},
    {kind:'stage',stage:'p2',stageIndex:1,pct:Number(s.p2Pct),date:addDays(d,s.p2Days),label:`${fmtNumber(s.p2Pct)}% · +${fmtInt(s.p2Days)} дней`,stock:false},
    {kind:'stage',stage:'p3',stageIndex:2,pct:Number(s.p3Pct),date:addMonthsSafe(d,s.p3Months),label:`${fmtNumber(s.p3Pct)}% · +${fmtInt(s.p3Months)} мес.`,stock:true}
  ].map(r=>({...r,id:`${inv.id}:${r.stage}`,invoiceId:inv.id,invoiceNumber:inv.number,invoiceDate:inv.date,auto:money2(Number(inv.total||0)*r.pct/100),qty:r.stock?totalInvoiceQty(inv):0}));
}
'''
new = '''function baseStages(inv){
  const s=state.settings, d=parseDate(inv.date);
  return [
    {kind:'stage',stage:'p1',stageIndex:0,pct:Number(s.p1Pct),autoDate:d,label:`${fmtNumber(s.p1Pct)}% · дата счёта`,stock:false},
    {kind:'stage',stage:'p2',stageIndex:1,pct:Number(s.p2Pct),autoDate:addDays(d,s.p2Days),label:`${fmtNumber(s.p2Pct)}% · +${fmtInt(s.p2Days)} дней`,stock:false},
    {kind:'stage',stage:'p3',stageIndex:2,pct:Number(s.p3Pct),autoDate:addMonthsSafe(d,s.p3Months),label:`${fmtNumber(s.p3Pct)}% · +${fmtInt(s.p3Months)} мес.`,stock:true}
  ].map(r=>{
    const id=`${inv.id}:${r.stage}`;
    const dateManualOverride=hasOwn(state.paymentDateOverrides,id);
    const date=dateManualOverride?parseDate(state.paymentDateOverrides[id]):new Date(r.autoDate);
    return {...r,id,date,dateManualOverride,invoiceId:inv.id,invoiceNumber:inv.number,invoiceDate:inv.date,auto:money2(Number(inv.total||0)*r.pct/100),qty:r.stock?totalInvoiceQty(inv):0};
  });
}
function stageSequenceIsValid(inv){
  const stages=baseStages(inv).sort((a,b)=>a.stageIndex-b.stageIndex);
  return stages.every((stage,i)=>i===0 || stages[i-1].date<=stage.date);
}
function invoiceIdFromStageId(stageId){
  const pos=String(stageId).lastIndexOf(':');
  return pos<0?'':String(stageId).slice(0,pos);
}
'''
assert old in s, "baseStages block not found"
s = s.replace(old, new)

old = '''function stockEvents(){
  return state.invoices.map(inv=>{
    const p3=baseStages(inv).find(x=>x.stage==='p3');
    return {date:p3.date,invoiceId:inv.id,invoiceNumber:inv.number,invoiceDate:inv.date,qty:totalInvoiceQty(inv),items:{...inv.items}};
  }).sort((a,b)=>a.date-b.date);
}
'''
new = '''function stockEvents(){
  return state.invoices.map(inv=>{
    const p3=baseStages(inv).find(x=>x.stage==='p3');
    return {date:p3.date,autoDate:p3.autoDate,dateManualOverride:p3.dateManualOverride,invoiceId:inv.id,invoiceNumber:inv.number,invoiceDate:inv.date,qty:totalInvoiceQty(inv),items:{...inv.items}};
  }).sort((a,b)=>a.date-b.date);
}
'''
assert old in s, "stockEvents block not found"
s = s.replace(old, new)

old = '''function stageMilestone(inv,p){
  const manual=p.manualOverride, recalc=p.recalculated;
  const meta=manual?`ручная сумма · база ${fmtMoney(p.auto)}`:recalc?`пересчитано · база ${fmtMoney(p.auto)}`:`база ${fmtMoney(p.auto)}`;
  return `<div class="milestone ${p.stock?'stock':''}"><b>${fmtNumber(p.pct)}% · ${fmtDate(p.date)}${p.stock?' · приход':''}</b><div class="milestone-edit"><input class="milestone-input" type="number" min="0" step="0.01" value="${p.used}" data-stage-override="${p.id}" aria-label="Платёж ${p.label} по счёту №${escapeHtml(inv.number)}"><button class="milestone-reset" type="button" data-reset-stage="${p.id}" ${manual?'':'hidden'} aria-label="Вернуть автоматический расчёт этапа">↺</button></div><span class="milestone-meta">${escapeHtml(meta)}</span></div>`;
}
'''
new = '''function stageMilestone(inv,p){
  const manual=p.manualOverride, recalc=p.recalculated, manualDate=p.dateManualOverride;
  const amountMeta=manual?`ручная сумма · база ${fmtMoney(p.auto)}`:recalc?`пересчитано · база ${fmtMoney(p.auto)}`:`база суммы ${fmtMoney(p.auto)}`;
  const dateMeta=manualDate?`ручная дата · база ${fmtDate(p.autoDate)}`:`база даты ${fmtDate(p.autoDate)}`;
  return `<div class="milestone ${p.stock?'stock':''}"><b>${fmtNumber(p.pct)}%${p.stock?' · приход':''}</b><div class="milestone-date-edit"><input class="milestone-date-input" type="date" value="${iso(p.date)}" data-stage-date="${p.id}" aria-label="Дата платежа ${p.label} по счёту №${escapeHtml(inv.number)}"><button class="milestone-reset" type="button" data-reset-stage-date="${p.id}" ${manualDate?'':'hidden'} aria-label="Вернуть автоматическую дату этапа">↺</button></div><span class="milestone-meta">${escapeHtml(dateMeta)}</span><div class="milestone-edit"><input class="milestone-input" type="number" min="0" step="0.01" value="${p.used}" data-stage-override="${p.id}" aria-label="Сумма платежа ${p.label} по счёту №${escapeHtml(inv.number)}"><button class="milestone-reset" type="button" data-reset-stage="${p.id}" ${manual?'':'hidden'} aria-label="Вернуть автоматический расчёт суммы этапа">↺</button></div><span class="milestone-meta">${escapeHtml(amountMeta)}</span></div>`;
}
'''
assert old in s, "stageMilestone block not found"
s = s.replace(old, new)

s = s.replace("Object.keys(state.paymentOverrides).filter(k=>k.startsWith(inv.id+':')).forEach(k=>delete state.paymentOverrides[k]); state.manualPayments=state.manualPayments.filter(p=>p.invoiceId!==inv.id);", "Object.keys(state.paymentOverrides).filter(k=>k.startsWith(inv.id+':')).forEach(k=>delete state.paymentOverrides[k]); Object.keys(state.paymentDateOverrides).filter(k=>k.startsWith(inv.id+':')).forEach(k=>delete state.paymentDateOverrides[k]); state.manualPayments=state.manualPayments.filter(p=>p.invoiceId!==inv.id);")

old = '''function bindStageEditors(root){
  root.querySelectorAll('[data-stage-override]').forEach(inp=>inp.addEventListener('change',()=>{
    const value=Math.max(0,Number(inp.value||0)); state.paymentOverrides[inp.dataset.stageOverride]=money2(value); saveState('Сумма этапа изменена'); renderAll(); setStatus('Сумма изменена. Более поздние автоматические платежи этого счёта пересчитаны.','success');
  }));
  root.querySelectorAll('[data-reset-stage]').forEach(btn=>btn.addEventListener('click',()=>{
    delete state.paymentOverrides[btn.dataset.resetStage]; saveState('Автоматический расчёт восстановлен'); renderAll(); setStatus('Ручная сумма снята. Более поздние платежи пересчитаны.','success');
  }));
}
'''
new = '''function bindStageEditors(root){
  root.querySelectorAll('[data-stage-date]').forEach(inp=>inp.addEventListener('change',()=>{
    const id=inp.dataset.stageDate, value=inp.value, invoiceId=invoiceIdFromStageId(id), inv=state.invoices.find(x=>x.id===invoiceId);
    if(!inv || !value){ renderAll(); setStatus('Дата не изменена: укажите корректную дату платежа.','error'); return; }
    const had=hasOwn(state.paymentDateOverrides,id), previous=state.paymentDateOverrides[id];
    state.paymentDateOverrides[id]=value;
    if(!stageSequenceIsValid(inv)){
      if(had)state.paymentDateOverrides[id]=previous; else delete state.paymentDateOverrides[id];
      renderAll(); setStatus('Дата не изменена: этапы счёта должны идти по порядку — 30% → 30% → 40%.','error'); return;
    }
    const stage=baseStages(inv).find(x=>x.id===id);
    saveState('Дата этапа изменена'); renderAll();
    setStatus(stage?.stock?'Дата 40% изменена. Приход товара, план продаж и денежный поток пересчитаны.':'Дата платежа изменена. План продаж, денежный поток и более поздние расчёты счёта обновлены.','success');
  }));
  root.querySelectorAll('[data-reset-stage-date]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.resetStageDate, invoiceId=invoiceIdFromStageId(id), inv=state.invoices.find(x=>x.id===invoiceId);
    delete state.paymentDateOverrides[id];
    if(inv && !stageSequenceIsValid(inv)){
      setStatus('Автоматическая дата восстановлена, но порядок этапов нарушен другой ручной датой. Проверьте даты счёта.','error');
    } else {
      setStatus('Автоматическая дата восстановлена. План и денежный поток пересчитаны.','success');
    }
    saveState('Автоматическая дата восстановлена'); renderAll();
  }));
  root.querySelectorAll('[data-stage-override]').forEach(inp=>inp.addEventListener('change',()=>{
    const value=Math.max(0,Number(inp.value||0)); state.paymentOverrides[inp.dataset.stageOverride]=money2(value); saveState('Сумма этапа изменена'); renderAll(); setStatus('Сумма изменена. Более поздние автоматические платежи этого счёта пересчитаны.','success');
  }));
  root.querySelectorAll('[data-reset-stage]').forEach(btn=>btn.addEventListener('click',()=>{
    delete state.paymentOverrides[btn.dataset.resetStage]; saveState('Автоматический расчёт восстановлен'); renderAll(); setStatus('Ручная сумма снята. Более поздние платежи пересчитаны.','success');
  }));
}
'''
assert old in s, "bindStageEditors block not found"
s = s.replace(old, new)

old = '''    const input=isStage?`<div class="override-wrap"><input class="amount-input" type="number" min="0" step="0.01" value="${p.used}" data-stage-override="${p.id}" aria-label="Текущий платёж ${p.label} по счёту №${escapeHtml(p.invoiceNumber)}"><button class="reset-override" type="button" data-reset-stage="${p.id}" ${p.manualOverride?'':'hidden'} aria-label="Вернуть автоматический расчёт этапа">↺</button></div>`:`<div class="override-wrap"><input class="amount-input" type="number" min="0" step="0.01" value="${p.used}" data-manual-amount="${p.manualPaymentId}" aria-label="Сумма дополнительного платежа"></div>`;
    const status=[historical?'<span class="pill history">до старта · история</span>':noSales?'<span class="pill gap">до первой выплаты</span>':'<span class="pill plan">участвует в плане</span>'];
    if(p.kind==='manual')status.push('<span class="pill extra">добавлен вручную</span>');
    if(p.manualOverride)status.push('<span class="pill manual">ручная сумма</span>');
    if(p.recalculated)status.push('<span class="pill recalc">пересчитан</span>');
    const actions=p.kind==='manual'?`<div class="actions"><button class="icon-btn" type="button" data-edit-payment="${p.manualPaymentId}" aria-label="Изменить дополнительный платёж">✎</button><button class="icon-btn danger" type="button" data-delete-payment="${p.manualPaymentId}" aria-label="Удалить дополнительный платёж">×</button></div>`:'—';
    tr.innerHTML=`<td class="date-cell mono">${fmtDate(p.date)}</td><td>${invoiceCell}</td><td>${escapeHtml(p.label)}</td><td class="num money">${isStage?fmtMoney(p.auto):'—'}</td>
      <td class="num">${input}</td><td class="num mono">${model.net>0?fmtInt(Math.ceil(p.used/model.net)):'—'}</td><td>${status.join(' ')}</td><td>${p.stock&&inv?`<span class="pill stock">+${fmtInt(totalInvoiceQty(inv))} шт.</span>`:'—'}</td><td>${actions}</td>`;
'''
new = '''    const dateInput=isStage?`<div class="date-edit-wrap"><input class="date-input" type="date" value="${iso(p.date)}" data-stage-date="${p.id}" aria-label="Текущая дата ${p.label} по счёту №${escapeHtml(p.invoiceNumber)}"><button class="reset-override" type="button" data-reset-stage-date="${p.id}" ${p.dateManualOverride?'':'hidden'} aria-label="Вернуть автоматическую дату этапа">↺</button></div><div class="cell-meta">база: ${fmtDate(p.autoDate)}</div>`:`<span class="mono">${fmtDate(p.date)}</span>`;
    const input=isStage?`<div class="override-wrap"><input class="amount-input" type="number" min="0" step="0.01" value="${p.used}" data-stage-override="${p.id}" aria-label="Текущий платёж ${p.label} по счёту №${escapeHtml(p.invoiceNumber)}"><button class="reset-override" type="button" data-reset-stage="${p.id}" ${p.manualOverride?'':'hidden'} aria-label="Вернуть автоматический расчёт этапа">↺</button></div>`:`<div class="override-wrap"><input class="amount-input" type="number" min="0" step="0.01" value="${p.used}" data-manual-amount="${p.manualPaymentId}" aria-label="Сумма дополнительного платежа"></div>`;
    const status=[historical?'<span class="pill history">до старта · история</span>':noSales?'<span class="pill gap">до первой выплаты</span>':'<span class="pill plan">участвует в плане</span>'];
    if(p.kind==='manual')status.push('<span class="pill extra">добавлен вручную</span>');
    if(p.dateManualOverride)status.push('<span class="pill manual-date">ручная дата</span>');
    if(p.manualOverride)status.push('<span class="pill manual">ручная сумма</span>');
    if(p.recalculated)status.push('<span class="pill recalc">пересчитан</span>');
    const actions=p.kind==='manual'?`<div class="actions"><button class="icon-btn" type="button" data-edit-payment="${p.manualPaymentId}" aria-label="Изменить дополнительный платёж">✎</button><button class="icon-btn danger" type="button" data-delete-payment="${p.manualPaymentId}" aria-label="Удалить дополнительный платёж">×</button></div>`:'—';
    tr.innerHTML=`<td>${dateInput}</td><td>${invoiceCell}</td><td>${escapeHtml(p.label)}</td><td class="num money">${isStage?fmtMoney(p.auto):'—'}</td>
      <td class="num">${input}</td><td class="num mono">${model.net>0?fmtInt(Math.ceil(p.used/model.net)):'—'}</td><td>${status.join(' ')}</td><td>${p.stock&&inv?`<span class="pill stock">+${fmtInt(totalInvoiceQty(inv))} шт.</span>`:'—'}</td><td>${actions}</td>`;
'''
assert old in s, "renderPayments date block not found"
s = s.replace(old, new)

old = """function exportPayments(){
  const m=computeModel();
  const rows=[['Дата','Дата счета','№ счета','Тип','Этап','База, руб.','Текущий платеж, руб.','Приход, шт.','Статус']];
  m.payments.forEach(p=>rows.push([fmtDate(p.date),p.invoiceDate?fmtDate(parseDate(p.invoiceDate)):'',p.invoiceNumber||'',p.kind==='manual'?'Дополнительный':'Автоматический',p.label,p.auto??'',p.used,p.qty,p.date<m.start?'История':p.recalculated?'Пересчитан':p.manualOverride?'Ручная сумма':'План']));
"""
new = """function exportPayments(){
  const m=computeModel();
  const rows=[['Текущая дата','Базовая дата','Дата счета','№ счета','Тип','Этап','База, руб.','Текущий платеж, руб.','Приход, шт.','Статус']];
  m.payments.forEach(p=>rows.push([fmtDate(p.date),p.autoDate?fmtDate(p.autoDate):'',p.invoiceDate?fmtDate(parseDate(p.invoiceDate)):'',p.invoiceNumber||'',p.kind==='manual'?'Дополнительный':'Автоматический',p.label,p.auto??'',p.used,p.qty,p.date<m.start?'История':p.dateManualOverride?'Ручная дата':p.recalculated?'Пересчитан':p.manualOverride?'Ручная сумма':'План']));
"""
assert old in s, "exportPayments block not found"
s = s.replace(old, new)

old = """  if(editingInvoiceId){const inv=state.invoices.find(x=>x.id===editingInvoiceId);Object.assign(inv,{number,date,total,items});saveState('Счёт изменён');setStatus('Счёт изменён. Его платежи, приход и будущий план продаж пересчитаны.','success');}
  else{state.invoices.push({id:uid(),number,date,total,items,sourceNote:'Счёт введён вручную в приложении.'});saveState('Счёт добавлен');setStatus('Счёт добавлен. Создан график платежей и приход товара.','success');}
"""
new = """  if(editingInvoiceId){
    const inv=state.invoices.find(x=>x.id===editingInvoiceId);
    const draft={...inv,number,date,total,items};
    if(!stageSequenceIsValid(draft)){
      $('invoiceFormError').textContent='Новая дата счёта конфликтует с вручную зафиксированными датами платежей. Сначала верните или измените ручные даты этапов.';
      $('invoiceDate').setAttribute('aria-invalid','true'); $('invoiceDate').focus(); return;
    }
    Object.assign(inv,{number,date,total,items});saveState('Счёт изменён');setStatus('Счёт изменён. Его платежи, приход и будущий план продаж пересчитаны.','success');
  }
  else{state.invoices.push({id:uid(),number,date,total,items,sourceNote:'Счёт введён вручную в приложении.'});saveState('Счёт добавлен');setStatus('Счёт добавлен. Создан график платежей и приход товара.','success');}
"""
assert old in s, "invoice edit block not found"
s = s.replace(old, new)

app.write_text(s, encoding="utf-8")

s = css.read_text(encoding="utf-8")
s = s.replace(".pill.manual{background:#F3EEFF;color:#6E4AA6;border-color:#DED2F5}.pill.recalc", ".pill.manual{background:#F3EEFF;color:#6E4AA6;border-color:#DED2F5}.pill.manual-date{background:#FFF7E8;color:#8A570B;border-color:#EFD7A7}.pill.recalc")
s = s.replace('.milestones{display:flex;gap:7px;align-items:stretch;min-width:520px}.milestone{flex:1;min-width:158px;', '.milestones{display:flex;gap:8px;align-items:stretch;min-width:720px}.milestone{flex:1;min-width:220px;')
s = s.replace('.milestone-edit{display:flex;align-items:center;gap:4px;margin-top:5px}.milestone-input{width:118px;', '.milestone-edit,.milestone-date-edit{display:flex;align-items:center;gap:4px;margin-top:5px}.milestone-input{width:132px;')
s = s.replace('background:#fff}.milestone-reset{width:27px;', 'background:#fff}.milestone-date-input{width:150px;min-height:31px;border:1px solid #C9D3DF;border-radius:7px;padding:4px 6px;color:var(--warning);font:700 10px "Cascadia Mono",Consolas,monospace;background:#fff}.milestone-reset{width:27px;')
s = s.replace('.override-wrap{display:flex;gap:5px;align-items:center;justify-content:flex-end}.amount-input,.actual-input{width:120px;min-height:32px;', '.override-wrap,.date-edit-wrap{display:flex;gap:5px;align-items:center;justify-content:flex-end}.amount-input,.actual-input,.date-input{min-height:32px;')
s = s.replace('background:#fff}.actual-input{width:82px}', 'background:#fff}.amount-input{width:120px;text-align:right;color:var(--cobalt)}.date-input{width:145px;color:var(--warning)}.actual-input{width:82px}')
s = s.replace('.row-history .amount-input{background:#F9FBFF;', '.row-history .amount-input,.row-history .date-input{background:#F9FBFF;')
s = s.replace('.reset-override[hidden]{display:none}.row-manual', '.reset-override[hidden]{display:none}.cell-meta{font-size:9px;color:var(--muted);text-align:right;margin-top:3px;white-space:nowrap}.row-manual')
css.write_text(s, encoding="utf-8")

s = index.read_text(encoding="utf-8")
s = s.replace('Любой этап можно изменить прямо в реестре счетов или в разделе «Платежи».', 'Дату и сумму любого этапа можно изменить прямо в реестре счетов или в разделе «Платежи». Ручная дата фиксирует только выбранный этап; остальные даты сохраняют свои правила от даты счёта.')
s = s.replace('Суммы 30 / 30 / 40 редактируются прямо здесь. Изменение одного платежа пересчитывает только более поздние автоматические платежи этого счёта.', 'Даты и суммы 30 / 30 / 40 редактируются прямо здесь. Изменение даты пересчитывает план продаж и денежный поток; изменение суммы пересчитывает более поздние автоматические платежи этого счёта.')
s = s.replace('Можно менять рассчитанные этапы и добавлять дополнительные платежи. Платёж, привязанный к счёту, уменьшает только его будущие автоматические этапы.', 'Можно менять даты и суммы рассчитанных этапов и добавлять дополнительные платежи. Платёж, привязанный к счёту, уменьшает только его будущие автоматические этапы.')
s = s.replace('Каждый приход происходит в дату финального 40%-го платежа.', 'Каждый приход происходит в текущую дату финального 40%-го платежа. Если дату 40% перенести вручную, приход товара переносится вместе с ней.')
s = s.replace('Версия 4 · автономное приложение', 'Версия 5 · автономное приложение')
index.write_text(s, encoding="utf-8")

print("v5 date editing applied")
