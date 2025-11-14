import { User } from '../entities/User'

export interface UserRepositoryPort {
  saveUser(user: User): Promise<void>
  findUserByEmail(email: string): Promise<User | null>
  updateUser(user: User): Promise<void>
  deleteUser(id: string): Promise<void>
}
