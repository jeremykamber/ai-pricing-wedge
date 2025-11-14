import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort'
import { User } from '../../domain/entities/User'
import { DatabaseServicePort } from '../../domain/ports/DatabaseServicePort'
import { dbToUser, userToDb } from '../mappers/UserMapper'

export class UserRepositoryImpl implements UserRepositoryPort {
  constructor(private db: DatabaseServicePort) {}

  async saveUser(user: User): Promise<void> {
    await this.db.insert('users', userToDb(user))
  }
  async findUserByEmail(email: string): Promise<User | null> {
    const dbUser = await this.db.find('users', { email })
    return dbUser ? dbToUser(dbUser) : null
  }
  async updateUser(user: User): Promise<void> {
    await this.db.update('users', user.id, userToDb(user))
  }
  async deleteUser(id: string): Promise<void> {
    await this.db.delete('users', id)
  }
}
