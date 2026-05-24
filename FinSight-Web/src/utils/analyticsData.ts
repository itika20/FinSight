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

// Categories excluded from spend charts — they are income or pass-throughs, not expenses.
const EXCLUDED_SPEND_CATS = new Set(['Salary', 'Transfers'])

export function getCategoryTotals(transactions: Transaction[]): CategoryTotal[] {
  // Net spend per category = debits − credits, floored at 0.
  // e.g. Rent with ₹25,000 debit and ₹5,000 flatmate-reimbursement credit → ₹20,000 net.
  const debits:  Record<string, number> = {}
  const credits: Record<string, number> = {}

  for (const t of transactions) {
    const cat = t.category || 'Uncategorised'
    if (EXCLUDED_SPEND_CATS.has(cat)) continue
    if (t.type === 'debit')  debits[cat]  = (debits[cat]  ?? 0) + Math.abs(t.amount)
    else                     credits[cat] = (credits[cat] ?? 0) + Math.abs(t.amount)
  }

  // Only include categories that have at least some debit activity
  const entries: { category: string; amount: number }[] = []
  for (const cat of Object.keys(debits)) {
    const net = Math.max(0, (debits[cat] ?? 0) - (credits[cat] ?? 0))
    if (net > 0) entries.push({ category: cat, amount: net })
  }

  const grand = entries.reduce((s, e) => s + e.amount, 0)
  return entries
    .sort((a, b) => b.amount - a.amount)
    .map(({ category, amount }) => ({
      category,
      amount: Math.round(amount),
      percentage: grand > 0 ? (amount / grand) * 100 : 0,
      color: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] ?? '#8B8B8B',
    }))
}

/**
 * Build monthly totals from a pre-sliced map of salary-window transactions.
 * Each key is 'YYYY-MM'; the value is the same transaction set the dashboard
 * shows when that month tab is selected (salary-window-adjusted, CC by billing_month).
 * This guarantees the trend chart bars match the dashboard stat cards exactly.
 */
export function getMonthlyTotals(transactionsByMonth: Record<string, Transaction[]>): MonthlyTotal[] {
  return Object.entries(transactionsByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, txns]) => {
      let debitGross = 0, creditOffset = 0, income = 0
      for (const t of txns) {
        if (t.category === 'Salary' && t.type === 'credit') {
          income += Math.abs(t.amount)
        } else if (t.category === 'Transfers') {
          // pass-through — excluded from both spend and income
        } else if (t.type === 'debit') {
          debitGross  += Math.abs(t.amount)
        } else {
          // non-salary credit in an expense category (reimbursement, refund)
          creditOffset += Math.abs(t.amount)
        }
      }
      return {
        month,
        label: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        debit:  Math.round(Math.max(0, debitGross - creditOffset)),
        credit: Math.round(income),
      }
    })
}

export function getDailyTotals(transactions: Transaction[]): DailyTotal[] {
  // Net spend per day — same netting as getCategoryTotals.
  const debits:  Record<string, number> = {}
  const credits: Record<string, number> = {}

  for (const t of transactions) {
    if (EXCLUDED_SPEND_CATS.has(t.category ?? '')) continue
    if (t.type === 'debit')  debits[t.date]  = (debits[t.date]  ?? 0) + Math.abs(t.amount)
    else                     credits[t.date] = (credits[t.date] ?? 0) + Math.abs(t.amount)
  }

  const allDates = new Set([...Object.keys(debits)])
  return Array.from(allDates)
    .sort()
    .map(date => {
      const net = Math.max(0, (debits[date] ?? 0) - (credits[date] ?? 0))
      return {
        date,
        label: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        amount: Math.round(net),
      }
    })
    .filter(d => d.amount > 0)
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
