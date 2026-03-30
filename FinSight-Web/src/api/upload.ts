import api from './axios'
import type { Transaction, DateRange } from '../models'

export interface UploadResponse {
  message: string
  upload_id: string
  transaction_count: number
  filename: string
  transactions: Transaction[]
}

export interface TransactionListResponse {
  transactions: Transaction[]
  total_count: number
  date_range: DateRange
}

export const uploadStatementApi = async (
  file: File,
  onUploadProgress?: (percent: number) => void
): Promise<UploadResponse> => {
  // FormData is how you send files over HTTP — not JSON
  const formData = new FormData()
  formData.append('file', file)

  const response = await api.post<UploadResponse>('/upload/statement', formData, {
    headers: {
      // Override default Content-Type — axios sets correct multipart boundary automatically
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      if (onUploadProgress && progressEvent.total) {
        const percent = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        )
        onUploadProgress(percent)
      }
    }
  })

  return response.data
}

export const getTransactionsApi = async (): Promise<TransactionListResponse> => {
  // Fetch all transactions for the logged-in user
  // No filters — just get everything
  // JWT token is attached automatically by axios interceptor
  const response = await api.get<TransactionListResponse>('/upload/transactions')
  return response.data
}