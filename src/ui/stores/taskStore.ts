import { create } from 'zustand'
import { ManageTasksUseCase } from '../../application/usecases/ManageTasksUseCase'
import { TaskRepositoryImpl } from '../../infrastructure/adapters/TaskRepositoryImpl'
import { Task } from '../../domain/entities/Task'

const repo = new TaskRepositoryImpl()
const useCase = new ManageTasksUseCase(repo)

interface TaskState {
  tasks: Task[]
  loading: boolean
  error: string | null
  addTask: (task: Task) => Promise<void>
  updateTask: (task: Task) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  fetchTasks: () => Promise<void>
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  addTask: async (task) => {
    set({ loading: true, error: null })
    try {
      await useCase.addTask(task)
      await get().fetchTasks()
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },
  updateTask: async (task) => {
    set({ loading: true, error: null })
    try {
      await useCase.updateTask(task)
      await get().fetchTasks()
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },
  deleteTask: async (id) => {
    set({ loading: true, error: null })
    try {
      await useCase.deleteTask(id)
      await get().fetchTasks()
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },
  fetchTasks: async () => {
    set({ loading: true, error: null })
    try {
      const tasks = await useCase.getTasks()
      set({ tasks })
    } catch (e) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },
}))
