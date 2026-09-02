import { Persona } from '../../domain/entities/Persona'

export function dbToPersona(db: any): Persona {
  return {
    id: db.id,
    name: db.name,
    age: db.age,
    occupation: db.occupation,
    educationLevel: db.educationLevel,
    interests: db.interests || [],
    goals: db.goals || [],
    backstory: db.backstory,
    // Big Five
    conscientiousness: db.conscientiousness ?? 50,
    neuroticism: db.neuroticism ?? 50,
    openness: db.openness ?? 50,
    extraversion: db.extraversion ?? 50,
    agreeableness: db.agreeableness ?? 50,
    // Psychographic spec
    values: db.values || [],
    fears: db.fears || [],
    communicationStyle: db.communicationStyle ?? "",
    decisionStyle: db.decisionStyle ?? "",
    // Pricing calibration
    pricingSensitivity: db.pricingSensitivity ?? 50,
    typicalBudget: db.typicalBudget ?? "",
    // Domain knowledge
    domainExpertise: db.domainExpertise || [],
  }
}

export function personaToDb(entity: Persona): any {
  return {
    id: entity.id,
    name: entity.name,
    age: entity.age,
    occupation: entity.occupation,
    educationLevel: entity.educationLevel,
    interests: entity.interests,
    goals: entity.goals,
    backstory: entity.backstory,
    // Big Five
    conscientiousness: entity.conscientiousness,
    neuroticism: entity.neuroticism,
    openness: entity.openness,
    extraversion: entity.extraversion,
    agreeableness: entity.agreeableness,
    // Psychographic spec
    values: entity.values,
    fears: entity.fears,
    communicationStyle: entity.communicationStyle,
    decisionStyle: entity.decisionStyle,
    // Pricing calibration
    pricingSensitivity: entity.pricingSensitivity,
    typicalBudget: entity.typicalBudget,
    // Domain knowledge
    domainExpertise: entity.domainExpertise,
  }
}
