import api from './axios'

export interface UploadResponse {
  message: string
  upload_id: string
  transaction_count: number
  filename: string
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