/**
 * Cálculo de dias úteis e feriados nacionais brasileiros.
 *
 * Toda a matemática aqui é PURA e determinística: opera sobre componentes
 * numéricos e strings ISO `YYYY-MM-DD`, sem depender de `Date.now()` nem do
 * timezone do ambiente (o `Date` é usado só em UTC, como em invoice.ts). É o que
 * os testes cobrem — mantenha a pureza.
 */

import { daysInMonth, toISO } from "./invoice";

/**
 * Domingo de Páscoa do ano (algoritmo de Computus / método de Meeus/Gauss).
 * @returns [ano, mês(0-11), dia].
 */
export function easterSunday(year: number): [number, number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [year, month - 1, day];
}

/** Soma `days` dias a uma data (componentes) e retorna ISO `YYYY-MM-DD`. */
function shiftDaysISO(year: number, month0: number, day: number, days: number): string {
  const dt = new Date(Date.UTC(year, month0, day + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

/**
 * Feriados nacionais brasileiros do ano, como conjunto de strings ISO
 * `YYYY-MM-DD`. Inclui os fixos e os móveis derivados da Páscoa
 * (Carnaval, Sexta-Feira Santa e Corpus Christi).
 */
export function brazilianHolidays(year: number): Set<string> {
  const fixed = [
    toISO(year, 0, 1), // Confraternização Universal
    toISO(year, 3, 21), // Tiradentes
    toISO(year, 4, 1), // Dia do Trabalho
    toISO(year, 8, 7), // Independência
    toISO(year, 9, 12), // Nossa Senhora Aparecida
    toISO(year, 10, 2), // Finados
    toISO(year, 10, 15), // Proclamação da República
    toISO(year, 11, 25), // Natal
  ];

  const [ey, em0, ed] = easterSunday(year);
  const movable = [
    shiftDaysISO(ey, em0, ed, -47), // Carnaval (terça)
    shiftDaysISO(ey, em0, ed, -2), // Sexta-Feira Santa
    shiftDaysISO(ey, em0, ed, 60), // Corpus Christi
  ];

  return new Set([...fixed, ...movable]);
}

/** Verdadeiro se a data (componentes) cai em sábado ou domingo. */
function isWeekend(year: number, month0: number, day: number): boolean {
  const weekday = new Date(Date.UTC(year, month0, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Retorna o dia (1–31) do N-ésimo dia útil do mês, pulando fins de semana e
 * feriados nacionais. Se `n` exceder a quantidade de dias úteis do mês, retorna
 * o último dia útil disponível.
 *
 * @param month0 mês 0-11.
 * @param n posição do dia útil (1 = 1º dia útil). Valores < 1 são tratados como 1.
 */
export function nthBusinessDay(year: number, month0: number, n: number): number {
  const holidays = brazilianHolidays(year);
  const total = daysInMonth(year, month0);
  const target = Math.max(1, n);

  let count = 0;
  let lastBusinessDay = 1;
  for (let day = 1; day <= total; day++) {
    if (isWeekend(year, month0, day)) continue;
    if (holidays.has(toISO(year, month0, day))) continue;
    count++;
    lastBusinessDay = day;
    if (count === target) return day;
  }
  return lastBusinessDay;
}
