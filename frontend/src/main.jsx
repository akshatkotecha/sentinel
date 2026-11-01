import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Where React starts: it finds <div id="root"> in index.html and draws App inside it.
// StrictMode adds extra checks during development only.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
