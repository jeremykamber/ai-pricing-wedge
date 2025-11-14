import { User } from '../../domain/entities/User'
import { UserDTO } from '../../domain/dtos/UserDTO'

export function dbToUser(db: any): User {
  return new User(db.id, db.username, db.email, db.password_hash)
}

export function userToDb(user: User): any {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    password_hash: user.getPasswordHash(),
  }
}

export function userToDTO(user: User): UserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    password: '', // never expose hash
  }
}
