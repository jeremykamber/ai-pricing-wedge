export class User {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public readonly email: string,
    private readonly passwordHash: string
  ) {}

  static fromDTO(dto: { id: string; username: string; email: string; password: string }): User {
    const passwordHash = User.hashPassword(dto.password)
    return new User(dto.id, dto.username, dto.email, passwordHash)
  }

  static hashPassword(password: string): string {
    // Simple hash for demo
    return password.split('').reverse().join('')
  }

  validate(): boolean {
    return this.email.includes('@') && this.username.length > 2
  }

  getPasswordHash(): string {
    return this.passwordHash
  }
}
