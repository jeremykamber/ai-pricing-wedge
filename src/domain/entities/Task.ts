export interface Task {
  id: string
  title: string
  description: string
  completed: boolean
}

export function validateTask(task: Task): boolean {
  return !!task.title && task.title.length > 2
}
