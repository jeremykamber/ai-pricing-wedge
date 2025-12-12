// Mapper for Persona
import { Persona } from '../../domain/entities/Persona'
// Uncomment if using DTO:
// import { PersonaDTO } from '../../domain/dtos/PersonaDTO'

// Example: DB record to entity
export function dbToPersona(db: any): Persona {
  return {
    id: db.id,
    // ...map other fields
  }
}

// Example: entity to DB record
export function personaToDb(entity: Persona): any {
  return {
    id: entity.id,
    // ...map other fields
  }
}

// Example: entity to DTO (uncomment if using DTO)
// export function personaToDTO(entity: Persona): PersonaDTO {
//   return {
//     id: entity.id,
//     // ...map other fields
//   }
// }

// Example: DTO to entity (uncomment if using DTO)
// export function dtoToPersona(dto: PersonaDTO): Persona {
//   return {
//     id: dto.id,
//     // ...map other fields
//   }
// }
