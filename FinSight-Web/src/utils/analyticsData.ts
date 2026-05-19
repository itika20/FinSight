/**
 * analyticsData — pure data-transformation utilities for the Analytics page.
 * All functions are stateless and accept a Transaction[] array.
 */

import type { Transaction } from '../models'
import { CATEGORY_COLORS } from '../constants/config'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryTotal {
  category: string
  amount: number
  percentage: number
  color: string
}

export interface MonthlyTotal {
  month: string       // 'YYYY-MM'
  label: string       // 'Jan 2026'
  debit: number
  credit: number
}

export interface DailyTotal {
  date: string        // 'YYYY-MM-DD'
  label: string       // '15 Mar'
  amount: number
}

export interface MerchantTotal {
  description: string
  amount: number
  percentage: number
}

export type RangePreset = '30d' | '3m' | '6m' | 'ytd' | 'custom'

// ─── Date range helpers ───────────────────────────────────────────────────────

export function getPresetRange(
  preset: RangePreset,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date } {
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const daysAgo = (n: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - n)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const monthsAgo = (n: number) => {
    const d = new Date(today)
    d.setMonth(d.getMonth() - n)
    d.setHours(0, 0, 0, 0)
    return d
  }

  switch (preset) {
    case '30d':   return { from: daysAgo(30),    to: today }
    case '3m':    return { from: monthsAgo(3),   to: today }
    case '6m':    return { from: monthsAgo(6),   to: today }
    case 'ytd':   return { from: new Date(today.getFullYear(), 0, 1, 0, 0, 0), to: today }
    case 'custom': {
      if (!customFrom || !customTo) return { from: monthsAgo(3), to: today }
      const from = new Date(customFrom); from.setHours(0, 0, 0, 0)
      const to   = new Date(customTo);   to.setHours(23, 59, 59, 999)
      return { from, to }
    }
  }
}

export function filterByRange(transactions: Transaction[], from: Date, to: Date): Transaction[] {
  return transactions.filter(t => {
    const d = new Date(t.date)
    return d >= from && d <= to
  })
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

export function getCategoryTotals(transactions: Transaction[]): CategoryTotal[] {
  const totals: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'debit') continue
    const cat = t.category || 'Uncategorised'
    totals[cat] = (totals[cat] ?? 0) + Math.abs(t.amount)
  }
  const grand = Object.values(totals).reduce((s, v) => s + v, 0)
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount),
      percentage: grand > 0 ? (amount / grand) * 100 : 0,
      color: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B',
    }))
}

export function getMonthlyTotals(transactions: Transaction[]): MonthlyTotal[] {
  const map: Record<string, { debit: number; credit: number }> = {}
  for (const t of transactions) {
    const m = t.date.slice(0, 7)
    if (!map[m]) map[m] = { debit: 0, credit: 0 }
    if (t.type === 'debit')  map[m].debit  += Math.abs(t.amount)
    else                     map[m].credit += Math.abs(t.amount)
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      debit:  Math.round(v.debit),
      credit: Math.round(v.credit),
    }))
}

export function getDailyTotals(transactions: Transaction[]): DailyTotal[] {
  const map: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'debit') continue
    map[t.date] = (map[t.date] ?? 0) + Math.abs(t.amount)
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({
      date,
      label: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      amount: Math.round(amount),
    }))
}

/**
 * Aggregate raw transaction descriptions for a category into merchant totals.
 * Pass a pre-built normalization map (description → merchant name) obtained
 * from the backend; unmapped descriptions fall back to a truncated raw string.
 */
export function getMerchantTotals(
  transactions: Transaction[],
  category: string,
  nameMap: Record<string, string> = {}
): MerchantTotal[] {
  const map: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'debit') continue
    if ((t.category || 'Uncategorised') !== category) continue
    const merchant = nameMap[t.description]
      ?? (t.description.length > 28 ? t.description.slice(0, 26) + '…' : t.description)
    map[merchant] = (map[merchant] ?? 0) + Math.abs(t.amount)
  }
  const grand = Object.values(map).reduce((s, v) => s + v, 0)
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([description, amount]) => ({
      description,
      amount: Math.round(amount),
      percentage: grand > 0 ? (amount / grand) * 100 : 0,
    }))
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export const fmtRupee = (n: number): string =>
  '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
