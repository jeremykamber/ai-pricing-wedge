import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort'
import { UserDTO } from '../../domain/dtos/UserDTO'
import { User } from '../../domain/entities/User'

export class RegisterUserUseCase {
  constructor(private repo: UserRepositoryPort) {}

  async execute(dto: UserDTO): Promise<void> {
    const user = User.fromDTO(dto)
    if (!user.validate()) throw new Error('Invalid user')
    const existing = await this.repo.findUserByEmail(user.email)
    if (existing) throw new Error('Email already registered')
    await this.repo.saveUser(user)
  }
}
