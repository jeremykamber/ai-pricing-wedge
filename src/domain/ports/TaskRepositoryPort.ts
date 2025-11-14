import { Task } from '../entities/Task'

export interface TaskRepositoryPort {
  saveTask(task: Task): Promise<void>
  getTasks(): Promise<Task[]>
  updateTask(task: Task): Promise<void>
  deleteTask(id: string): Promise<void>
}
