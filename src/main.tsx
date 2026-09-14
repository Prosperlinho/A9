import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import App from './App'
import './styles.css'
const convexUrl = import.meta.env.VITE_CONVEX_URL
const client = convexUrl ? new ConvexReactClient(convexUrl) : null
createRoot(document.getElementById('root')!).render(<StrictMode>{client ? <ConvexAuthProvider client={client}><App /></ConvexAuthProvider> : <App />}</StrictMode>)