/**
 * Upload & Transaction API Functions
 * Handles bank statement uploads and transaction data retrieval.
 */

import api from './axios'
import type { Transaction, DateRange, Upload, UploadListResponse, DeleteUploadResponse } from '../models'
// Re-export so callers can import response types from this module if needed
export type { Upload, UploadListResponse, DeleteUploadResponse }
import { UPLOAD_ENDPOINTS } from '../constants/config'

export interface UploadResponse {
  message: string
  upload_id: string
  transaction_count: number
  skipped_count: number
  filename: string
  transactions: Transaction[]
}

export interface TransactionListResponse {
  transactions: Transaction[]
  total_count: number
  date_range: DateRange
}

/**
 * Upload Bank Statement - Sends PDF file to backend for parsing.
 * 
 * The upload process:
 * 1. File is sent as multipart/form-data (FormData)
 * 2. Backend validates file type and size
 * 3. Backend parses PDF with GPT-4o (15-30 seconds)
 * 4. Transactions are extracted and stored
 * 5. Response includes parsed transactions and metadata
 * 
 * @param file - PDF File object from form input
 * @param onUploadProgress - Callback(percent: 0-100) for upload progress UI
 * 
 * @returns Promise<UploadResponse> - Parsed transactions and upload details
 * 
 * @throws HTTPException - 400 if invalid file (not PDF)
 * @throws HTTPException - 413 if file > 10MB
 * @throws HTTPException - 422 if parsing fails (invalid/empty PDF)
 * 
 * @example
 * const response = await uploadStatementApi(file, (percent) => {
 *   console.log(`Upload: ${percent}%`)
 *   if (percent === 100) console.log('Parsing...')
 * })
 * console.log(`Found ${response.transaction_count} transactions`)
 */
export const uploadStatementApi = async (
  file: File,
  onUploadProgress?: (percent: number) => void
): Promise<UploadResponse> => {
  // FormData required for file uploads (not JSON)
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post<UploadResponse>(UPLOAD_ENDPOINTS.STATEMENT, formData, {
    headers: {
      // Override default Content-Type — axios sets correct multipart boundary automatically
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      if (onUploadProgress && progressEvent.total) {
        // Calculate percentage: 0-100
        const percent = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        )
        onUploadProgress(percent)
      }
    }
  })

  return response.data
}

export interface CategoryUpdateResponse {
  message: string
  transaction_id: string
  category: string
  vpa_saved: boolean
}

/**
 * Update Transaction Category - Corrects the ML-assigned category for a transaction.
 *
 * The backend will:
 * 1. Update the transaction's category and mark confidence as 'user_confirmed'
 * 2. Extract the UPI VPA from the transaction description
 * 3. Save the VPA → category mapping to user_vpa_memory
 *    (future uploads with the same merchant will auto-categorise correctly)
 *
 * @param transactionId - UUID of the transaction to update
 * @param category - New category string (must be a valid TRANSACTION_CATEGORIES value)
 *
 * @returns Promise<CategoryUpdateResponse> - Confirmation with vpa_saved flag
 *
 * @throws HTTPException - 400 if category is not in the valid list
 * @throws HTTPException - 404 if transaction not found or doesn't belong to user
 */
export const updateCategoryApi = async (
  transactionId: string,
  category: string
): Promise<CategoryUpdateResponse> => {
  const url = UPLOAD_ENDPOINTS.UPDATE_CATEGORY.replace('{id}', transactionId)
  const response = await api.patch<CategoryUpdateResponse>(url, { category })
  return response.data
}

/**
 * Get User Transactions - Retrieves all transactions for authenticated user.
 * 
 * This endpoint:
 * - Fetches ALL transactions from all uploads
 * - Returns computed date range (min/max dates)
 * - Returns total count of transactions
 * - Can be filtered by date range or type (via query params)
 * 
 * @param startDate - Optional: Filter transactions from this date (YYYY-MM-DD)
 * @param endDate - Optional: Filter transactions until this date (YYYY-MM-DD)
 * @param type - Optional: Filter by 'debit' or 'credit'
 * 
 * @returns Promise<TransactionListResponse> - Transactions plus metadata
 * 
 * @throws HTTPException - 401 if token expired or missing
 * 
 * @example
 * // Get all transactions
 * const all = await getTransactionsApi()
 * 
 * // Get March 2026 transactions
 * const march = await getTransactionsApi('2026-03-01', '2026-03-31')
 * 
 * // Get all debits
 * const debits = await getTransactionsApi(undefined, undefined, 'debit')
 */
export const getTransactionsApi = async (
  startDate?: string,
  endDate?: string,
  type?: string
): Promise<TransactionListResponse> => {
  // Build query parameters (only include if provided)
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  if (type) params.append('type', type)

  // Fetch all transactions for the logged-in user
  // JWT token attached automatically by interceptor
  const url = params.toString()
    ? `${UPLOAD_ENDPOINTS.TRANSACTIONS}?${params.toString()}`
    : UPLOAD_ENDPOINTS.TRANSACTIONS

  const response = await api.get<TransactionListResponse>(url)
  return response.data
}

/**
 * List all completed statement uploads for the current user.
 */
export const getUploadsApi = async (): Promise<Upload[]> => {
  const response = await api.get<UploadListResponse>(UPLOAD_ENDPOINTS.UPLOADS)
  return response.data.uploads
}

/**
 * Delete an upload record and all its transactions.
 * VPA memory is preserved (user's learned categorisations are kept).
 * Returns the number of transactions that were removed.
 */
export const deleteUploadApi = async (uploadId: string): Promise<DeleteUploadResponse> => {
  const url = UPLOAD_ENDPOINTS.DELETE_UPLOAD.replace('{id}', uploadId)
  const response = await api.delete<DeleteUploadResponse>(url)
  return response.data
}

/**
 * Normalize raw transaction descriptions to clean merchant names via GPT-4o-mini.
 * Send deduplicated descriptions; receive a description→merchantName map.
 */
export const normalizeMerchantsApi = async (
  descriptions: string[]
): Promise<Record<string, string>> => {
  const response = await api.post<{ normalized: Record<string, string> }>(
    UPLOAD_ENDPOINTS.NORMALIZE_MERCHANTS,
    { descriptions }
  )
  return response.data.normalized
}