// Mapper for Persona
import { Persona } from '../../domain/entities/Persona'
// Uncomment if using DTO:
// import { PersonaDTO } from '../../domain/dtos/PersonaDTO'

// Example: DB record to entity
export function dbToPersona(db: any): Persona {
  return {
    id: db.id,
    name: db.name,
    age: db.age,
    occupation: db.occupation,
    educationLevel: db.educationLevel,
    interests: db.interests || [],
    goals: db.goals || [],
    personalityTraits: db.personalityTraits || [],
    backstory: db.backstory,
  }
}

// Example: entity to DB record
export function personaToDb(entity: Persona): any {
  return {
    id: entity.id,
    name: entity.name,
    age: entity.age,
    occupation: entity.occupation,
    educationLevel: entity.educationLevel,
    interests: entity.interests,
    goals: entity.goals,
    personalityTraits: entity.personalityTraits,
    backstory: entity.backstory,
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
