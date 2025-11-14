'use client'
import React from 'react'
import { useUserStore } from '../stores/userStore'

export const RegisterUserComponent: React.FC = () => {
  const { loading, error, registerUser } = useUserStore()

  return (
    <div className="p-4 border rounded-xl">
      <button onClick={() => registerUser('123', 'test@example.com', 'password')} disabled={loading}>
        Register
      </button>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  )
}
