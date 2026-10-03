/**
 * Amounts a portal has already pulled out of its own response, all ≥ 0.
 * Each portal maps its API shape to this; the wording lives only here, so the
 * Telegram line `💰 ЛС …: …` reads the same for every portal.
 */
export interface BalanceSummary {
  debt: number;
  overpayment: number;
  /** Parts of the response the portal could not interpret (logged there). */
  unrecognised?: number;
}

/**
 * Debt and overpayment are shown side by side rather than netted: on a
 * multi-provider bill (pesc's ЕПД) an overpayment to one provider does not
 * cover what is owed to another. "к оплате" rather than "задолженность" —
 * the figure is usually just the current bill, not something overdue.
 */
export function formatBalanceText({ debt, overpayment, unrecognised = 0 }: BalanceSummary): string {
  const parts: string[] = [];
  if (overpayment > 0) {
    parts.push(`переплата ${overpayment.toFixed(2)} руб`);
  }
  if (debt > 0) {
    parts.push(`к оплате ${debt.toFixed(2)} руб`);
  }
  if (unrecognised > 0) {
    parts.push(`не распознано позиций: ${String(unrecognised)}, см. лог`);
  }
  return parts.length > 0 ? parts.join(', ') : 'расчёты без долга';
}
