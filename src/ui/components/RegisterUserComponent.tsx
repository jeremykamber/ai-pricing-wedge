'use client'
import React, { useState } from 'react'
import { useUserStore } from '../stores/userStore'

export const RegisterUserComponent: React.FC = () => {
  const { loading, error, register } = useUserStore()
  const [formData, setFormData] = useState({ id: '', username: '', email: '', password: '' })

  const handleRegister = async () => {
    await register(formData)
  }

  return (
    <div className="p-4 border rounded-xl">
      <input
        type="text"
        placeholder="ID"
        value={formData.id}
        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
      />
      <input
        type="text"
        placeholder="Username"
        value={formData.username}
        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
      />
      <input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      />
      <input
        type="password"
        placeholder="Password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
      />
      <button onClick={handleRegister} disabled={loading}>
        Register
      </button>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  )
}
