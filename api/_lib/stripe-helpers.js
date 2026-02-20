// api/_lib/stripe-helpers.js
// Helpers para compatibilidad con Stripe SDK v20+
// En SDK v20, current_period_start/end están en subscription.items.data[0]
// en vez de directamente en el objeto de suscripción.

/**
 * Extrae las fechas del período actual de una suscripción de Stripe.
 * Compatible con Stripe SDK v20+ donde los campos se movieron a items.
 */
export function getSubscriptionPeriod(subscription) {
  // Primero intentar en el nivel top (APIs antiguas / webhooks con versión anterior)
  let start = subscription.current_period_start;
  let end = subscription.current_period_end;

  // Si no están ahí, buscar en items.data[0] (Stripe SDK v20+)
  if (start === undefined || end === undefined) {
    const item = subscription.items?.data?.[0];
    if (item) {
      start = start ?? item.current_period_start;
      end = end ?? item.current_period_end;
    }
  }

  // Fallback a start_date / billing_cycle_anchor si nada más funciona
  if (start === undefined) {
    start = subscription.start_date || subscription.created;
  }

  return {
    currentPeriodStart: start ? new Date(start * 1000) : new Date(),
    currentPeriodEnd: end ? new Date(end * 1000) : null,
  };
}
