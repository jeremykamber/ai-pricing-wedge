'use client'
import React, { useState } from 'react'
import { useUserStore } from '../stores/userStore'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const UserForm: React.FC = () => {
  const { register, login, loading, error, user, logout, remove } = useUserStore()
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Card className="max-w-md mx-auto mt-10">
      <CardHeader>
        <CardTitle>{mode === 'register' ? 'Register' : 'Login'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-2" onSubmit={async e => {
          e.preventDefault()
          if (mode === 'register') {
            await register({ id: Date.now().toString(), username, email, password })
          } else {
            await login(email, password)
          }
        }}>
          {mode === 'register' && (
            <Input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          )}
          <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" disabled={loading}>
            {mode === 'register' ? 'Register' : 'Login'}
          </Button>
        </form>
        <Button variant="link" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
          {mode === 'register' ? 'Already have an account? Login' : "Don't have an account? Register"}
        </Button>
        {user && (
          <div className="mt-4">
            <p>Logged in as: {user.username}</p>
            <Button onClick={logout}>Logout</Button>
            <Button variant="destructive" onClick={() => remove(user.id)}>Delete Account</Button>
          </div>
        )}
        {loading && <p>Loading...</p>}
        {error && <p className="text-red-500">{error}</p>}
      </CardContent>
    </Card>
  )
}
