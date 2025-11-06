// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import WasteDashboard from './pages/WasteDashboard.tsx'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<WasteDashboard />} />
      </Routes>
    </Router>
  )
}
