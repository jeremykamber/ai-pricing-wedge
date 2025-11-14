import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort'
import { User } from '../../domain/entities/User'

export class EditUserUseCase {
  constructor(private repo: UserRepositoryPort) {}

  async execute(user: User): Promise<void> {
    if (!user.validate()) throw new Error('Invalid user')
    await this.repo.updateUser(user)
  }
}
