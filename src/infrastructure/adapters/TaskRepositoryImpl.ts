import { TaskRepositoryPort } from '../../domain/ports/TaskRepositoryPort'
import { Task } from '../../domain/entities/Task'

export class TaskRepositoryImpl implements TaskRepositoryPort {
  private tasks: Task[] = []

  async saveTask(task: Task): Promise<void> {
    this.tasks.push(task)
  }
  async getTasks(): Promise<Task[]> {
    return this.tasks
  }
  async updateTask(task: Task): Promise<void> {
    const idx = this.tasks.findIndex(t => t.id === task.id)
    if (idx !== -1) this.tasks[idx] = task
  }
  async deleteTask(id: string): Promise<void> {
    this.tasks = this.tasks.filter(t => t.id !== id)
  }
}
