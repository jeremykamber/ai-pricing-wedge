'use client'
import React, { useEffect, useState } from 'react'
import { useTaskStore } from '../stores/taskStore'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const Dashboard: React.FC = () => {
  const { tasks, loading, error, addTask, fetchTasks, deleteTask } = useTaskStore()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')

  useEffect(() => { fetchTasks() }, [])

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Task</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex gap-2" onSubmit={e => {
            e.preventDefault()
            addTask({ id: Date.now().toString(), title, description: desc, completed: false })
            setTitle('')
            setDesc('')
          }}>
            <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <Input placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} />
            <Button type="submit" disabled={loading}>Add</Button>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {tasks.map(task => (
          <Card key={task.id}>
            <CardHeader>
              <CardTitle>{task.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <span>{task.description}</span>
                <Button variant="destructive" onClick={() => deleteTask(task.id)} disabled={loading}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  )
}
