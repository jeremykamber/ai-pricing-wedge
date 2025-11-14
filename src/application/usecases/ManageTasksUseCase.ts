import { TaskRepositoryPort } from '../../domain/ports/TaskRepositoryPort'
import { Task, validateTask } from '../../domain/entities/Task'

export class ManageTasksUseCase {
  constructor(private repo: TaskRepositoryPort) {}

  async addTask(task: Task): Promise<void> {
    if (!validateTask(task)) throw new Error('Invalid task')
    await this.repo.saveTask(task)
  }
  async getTasks(): Promise<Task[]> {
    return this.repo.getTasks()
  }
  async updateTask(task: Task): Promise<void> {
    if (!validateTask(task)) throw new Error('Invalid task')
    await this.repo.updateTask(task)
  }
  async deleteTask(id: string): Promise<void> {
    await this.repo.deleteTask(id)
  }
}
