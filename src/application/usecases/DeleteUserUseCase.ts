import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort'

export class DeleteUserUseCase {
  constructor(private repo: UserRepositoryPort) {}

  async execute(id: string): Promise<void> {
    await this.repo.deleteUser(id)
  }
}
