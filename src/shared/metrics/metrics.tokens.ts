/**
 * Metrika DI tokenlari — ALOHIDA faylda.
 *
 * Nega: controller eksporterni, module esa controllerni biladi. Tokenlar
 * module faylida turса `controller → module → controller` aylanma
 * bog'liqligi paydo bo'lardi va `pnpm arch:check` (`no-circular`) buni
 * xato sifatida to'xtatadi. Token — sof qiymat, uni ushlab turish uchun
 * eng past qatlam kerak.
 */

/** `PrometheusExporter` nusxasi (MetricReader) — /metrics uni serializatsiya qiladi. */
export const METRICS_EXPORTER = Symbol('METRICS_EXPORTER');

/** `MeterProvider` nusxasi — ilova yopilganda shutdown qilinadi. */
export const METRICS_METER_PROVIDER = Symbol('METRICS_METER_PROVIDER');

/** `Meter` — MetricsService instrumentlarni shundan yaratadi. */
export const METRICS_METER = Symbol('METRICS_METER');
