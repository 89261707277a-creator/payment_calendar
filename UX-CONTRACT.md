# UX Contract — Volmax Mixer Cashflow

Business source: current user brief dated 2026-09-07 and invoice documents supplied in the same conversation.

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native `<select>` in the additional-payment dialog | This contract | native | keyboard + browser |
| Date | Native `<input type="date">` | This contract | native | locale + keyboard + browser |
| Form | App-owned invoice/payment dialogs and inline validation in `index.html` | This contract | invoice / payment | browser success + validation |
| Scrollbar | Global application CSS in `styles.css` | `DESIGN.md` | table geometry only | computed/rendered style |
| CRUD | Local state + app-owned dialogs in `app.js` | This contract | invoice / additional payment | full-flow browser test |

## Financial rules
- Invoice identity is its actual invoice date and number; do not use ordinal names such as "first invoice".
- Default payment terms are visible and editable: 30% on invoice date, 30% at invoice date + 50 calendar days, 40% at invoice date + 2 calendar months.
- Quantities for stock replenishment come from invoice SKU lines. By default, the stock-arrival date follows the current 40% milestone date. The arrival date can be fixed separately; while fixed, later changes to the 40% date do not move stock. Resetting the arrival-date override re-links it to the current 40% date.
- Each scheduled invoice stage has both a base date/current date and a base amount/current amount. Base dates come from the invoice terms; current dates and amounts are what the model actually uses.
- A manual amount edit to a scheduled stage fixes that stage at the entered amount. Earlier events are never rewritten; later automatic stages of the same invoice recalculate from the invoice balance.
- A manual payment-date edit fixes only the selected stage date. It does not shift the other payment dates automatically. Payment stages must remain ordered as first 30% <= second 30% <= final 40%. Moving a payment date immediately recalculates invoice event ordering, required sales timing, cashflow, charts, and monthly summaries. If the arrival date is still automatic, moving 40% also moves arrival; if arrival is manually fixed, it stays unchanged.
- A manual arrival-date edit is independent from payment timing. It immediately recalculates physical stock availability, required sales capacity, opening/end stock and stock-related warnings. It does not change any supplier payment date or amount.
- An additional payment may be linked to an invoice or be standalone. A linked payment reduces the invoice balance and therefore recalculates only later automatic stages of that invoice. A standalone payment affects cashflow and the required sales plan but does not change any invoice schedule.
- Remaining invoice balance is distributed across later automatic scheduled stages in proportion to their configured percentage weights. The final remaining automatic stage takes the residual balance to the nearest kopek so a normally adjusted invoice closes to zero.
- If no later automatic stage exists, underpayment or overpayment remains visible as the invoice balance; the UI must not silently alter earlier events.
- Payments before the model start date are historical. Their amounts may be manually overridden and they are excluded from financing needs after the model start.
- Sales cash becomes available one calendar month after the end of each 7-day sales period by default.
- Sales requirement is calculated in aggregate across the six SKU using `unit cost * sales multiplier` as cash generated per sold unit.
- The model must not plan sales above physical aggregate stock availability; any remaining payment need becomes external financing.

## Interaction rules
- Invoice create/edit occurs in an app-owned dialog; Save keeps the user on the invoice register and shows inline status.
- Additional payment create/edit occurs in an app-owned dialog. The user chooses an optional invoice link, payment date, amount and comment.
- Invoice delete, additional-payment delete and full reset require an app-owned confirmation dialog. Browser alert/confirm/prompt are prohibited.
- Scheduled payment dates and amounts can be edited directly in both the invoice register and the payment calendar. Arrival date can be edited directly in the invoice register and in the stock-arrivals table. Separate reset controls remove manual overrides; resetting arrival re-links it to the current 40% date.
- Editing an invoice date, total or model payment terms recalculates generated payment base dates/amounts. Existing manual payment date/amount overrides remain attached to that invoice stage until explicitly reset; an invoice-date change is blocked if it would violate the chronological stage order against a fixed manual payment date. A manually fixed arrival date remains unchanged; an automatic arrival continues to follow the current 40% date.
- Editing or deleting a linked additional payment immediately recalculates later automatic stages of that invoice, then recalculates sales plan, cash gap, charts and monthly summaries.
- Data is saved locally in the browser. UI wording says "Сохранено в браузере" and never implies server synchronization.
- JSON export/import is the portability path. Import failures appear in an inline status region and preserve current data.
- Tabs are keyboard-operable and persist the active view in the URL query string.

## Data display
- Invoice, payment, weekly sales, stock and monthly dashboard datasets are bounded and rendered in full.
- Financial and quantity tables preserve horizontal scrolling on narrow screens; no columns are silently removed.
- Every graph has a tabular equivalent.
- Recalculated values, manually fixed payment dates, manually fixed arrival dates, manually fixed amounts, and manually added payments have distinct text status labels; color is supplemental only.

## Accessibility and locale
- Target WCAG 2.2 AA baseline.
- Russian (`ru-RU`) currency/date/number formatting; date-only values are stored as `YYYY-MM-DD` without timezone conversion.
- Native date inputs and the native invoice `<select>` are explicit ownership decisions for the supported desktop browser workflow.
