import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort'

export class LoginUserUseCase {
  constructor(private repo: UserRepositoryPort) {}

  async execute(email: string, password: string): Promise<boolean> {
    const user = await this.repo.findUserByEmail(email)
    if (!user) throw new Error('User not found')
    if (user.getPasswordHash() !== password.split('').reverse().join('')) throw new Error('Invalid password')
    return true
  }
}
