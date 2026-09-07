from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = root / 'app.js'
ux = root / 'UX-CONTRACT.md'
design = root / 'DESIGN.md'
readme = root / 'README.md'

s = app.read_text(encoding='utf-8')
old = "setStatus(stage?.stock?'Дата 40% изменена. Приход товара, план продаж и денежный поток пересчитаны.':'Дата платежа изменена. План продаж, денежный поток и более поздние расчёты счёта обновлены.','success');"
new = "setStatus(stage?.stock?(hasOwn(state.stockDateOverrides,inv.id)?'Дата 40% изменена. Ручная дата прихода сохранена; платежи, план продаж и денежный поток пересчитаны.':'Дата 40% изменена. Дата прихода следует за 40%; остатки, план продаж и денежный поток пересчитаны.'):'Дата платежа изменена. План продаж, денежный поток и более поздние расчёты счёта обновлены.','success');"
if old not in s:
    raise SystemExit('stage status target missing')
s = s.replace(old, new, 1)
app.write_text(s, encoding='utf-8')

u = ux.read_text(encoding='utf-8')
u = u.replace(
    '- The 40% milestone is also the stock-replenishment date; quantities come from invoice SKU lines. Changing only a payment amount does not move the stock date. Manually changing the 40% milestone date moves the stock-replenishment date with it.\n',
    '- Quantities for stock replenishment come from invoice SKU lines. By default, the stock-arrival date follows the current 40% milestone date. The arrival date can be fixed separately; while fixed, later changes to the 40% date do not move stock. Resetting the arrival-date override re-links it to the current 40% date.\n'
)
u = u.replace(
    '- A manual date edit fixes only the selected stage date. It does not shift the other stage dates automatically. Payment stages must remain ordered as first 30% <= second 30% <= final 40%. Moving a stage date immediately recalculates invoice event ordering, required sales timing, cashflow, charts, and monthly summaries.\n',
    '- A manual payment-date edit fixes only the selected stage date. It does not shift the other payment dates automatically. Payment stages must remain ordered as first 30% <= second 30% <= final 40%. Moving a payment date immediately recalculates invoice event ordering, required sales timing, cashflow, charts, and monthly summaries. If the arrival date is still automatic, moving 40% also moves arrival; if arrival is manually fixed, it stays unchanged.\n- A manual arrival-date edit is independent from payment timing. It immediately recalculates physical stock availability, required sales capacity, opening/end stock and stock-related warnings. It does not change any supplier payment date or amount.\n'
)
u = u.replace(
    '- Scheduled dates and amounts can be edited directly in both the invoice register and the payment calendar. Separate reset controls remove the manual date or amount override and restore its automatic base value.\n',
    '- Scheduled payment dates and amounts can be edited directly in both the invoice register and the payment calendar. Arrival date can be edited directly in the invoice register and in the stock-arrivals table. Separate reset controls remove manual overrides; resetting arrival re-links it to the current 40% date.\n'
)
u = u.replace(
    '- Editing an invoice date, total or model payment terms recalculates its generated base dates/amounts and stock receipt immediately. Existing manual stage date/amount overrides remain attached to that invoice stage until explicitly reset; an invoice-date change is blocked if it would violate the chronological stage order against a fixed manual date.\n',
    '- Editing an invoice date, total or model payment terms recalculates generated payment base dates/amounts. Existing manual payment date/amount overrides remain attached to that invoice stage until explicitly reset; an invoice-date change is blocked if it would violate the chronological stage order against a fixed manual payment date. A manually fixed arrival date remains unchanged; an automatic arrival continues to follow the current 40% date.\n'
)
u = u.replace(
    '- Recalculated values, manually fixed dates, manually fixed amounts, and manually added payments have distinct text status labels; color is supplemental only.\n',
    '- Recalculated values, manually fixed payment dates, manually fixed arrival dates, manually fixed amounts, and manually added payments have distinct text status labels; color is supplemental only.\n'
)
ux.write_text(u, encoding='utf-8')

d = design.read_text(encoding='utf-8')
d = d.replace(
    '- **Do:** отделять базовую дату и сумму от текущих значений, явно помечать ручную дату, ручную сумму и автоматический пересчёт будущих этапов.\n',
    '- **Do:** отделять базовую дату и сумму платежа от текущих значений, отдельно показывать базовую/текущую дату прихода и явно помечать ручную дату платежа, ручную дату прихода, ручную сумму и автоматический пересчёт будущих этапов.\n'
)
design.write_text(d, encoding='utf-8')

r = readme.read_text(encoding='utf-8')
r = r.replace(
    '- На дату финальных 40% количество из счёта пополняет остаток.\n',
    '- По умолчанию на текущую дату финальных 40% количество из счёта пополняет остаток. Дату прихода можно изменить отдельно.\n'
)
r = r.replace(
    '- Даты этапов сохраняют порядок 30% → 30% → 40%. Если перенести дату 40%, дата прихода товара переносится вместе с ней. Любое изменение даты сразу пересчитывает необходимый момент продаж, кассовый разрыв и денежный поток.\n',
    '- Даты этапов сохраняют порядок 30% → 30% → 40%. Пока дата прихода не изменена вручную, она следует за датой 40%. После ручной фиксации приход живёт независимо; кнопка ↺ снова связывает его с 40%. Любое изменение даты сразу пересчитывает нужный момент продаж, физическую доступность товара, кассовый разрыв и денежный поток.\n'
)
readme.write_text(r, encoding='utf-8')
print('v6 arrival behavior finalized')
