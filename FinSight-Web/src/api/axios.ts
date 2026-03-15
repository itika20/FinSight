import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// REQUEST INTERCEPTOR
// This runs automatically before every single API call
// Its job: attach the JWT token to every request so backend knows who you are
api.interceptors.request.use(
  (config) => {
    // Read token from localStorage
    const token = localStorage.getItem('token')

    // If token exists, add it to the Authorization header
    // Backend FastAPI reads this header to identify the user
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error)
)

// RESPONSE INTERCEPTOR
// This runs automatically after every API response comes back
// Its job: if backend returns 401 (unauthorized), token is expired — force logout
api.interceptors.response.use(
  (response) => response, // if response is fine, just return it as-is
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear everything and go to login
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api