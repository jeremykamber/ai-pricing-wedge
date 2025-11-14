import { Task } from '../../domain/entities/Task'
import { TaskDTO } from '../../domain/dtos/TaskDTO'

export function dbToTask(db: any): Task {
  return {
    id: db.id,
    title: db.title,
    description: db.description,
    completed: db.completed,
  }
}

export function taskToDb(task: Task): any {
  return { ...task }
}

export function taskToDTO(task: Task): TaskDTO {
  return { ...task }
}

export function dtoToTask(dto: TaskDTO): Task {
  return { ...dto }
}
