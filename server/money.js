export function toPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

export function toRupees(paise) {
  return Number(paise || 0) / 100;
}

/** Matches the existing billing screen: tax is rounded to the nearest rupee. */
export function priceOrder(lines, discountRupees, taxPercent) {
  const subtotal = lines.reduce((sum, line) => sum + line.pricePaise * line.qty, 0);
  const subtotalRupees = toRupees(subtotal);
  const discount = Math.min(subtotalRupees, Math.max(0, Number(discountRupees) || 0));
  const discounted = Math.max(0, subtotalRupees - discount);
  const tax = Math.round((discounted * Number(taxPercent || 0)) / 100);
  const total = discounted + tax;
  return {
    subtotalPaise: toPaise(subtotalRupees),
    discountPaise: toPaise(discount),
    taxPaise: toPaise(tax),
    totalPaise: toPaise(total),
  };
}
