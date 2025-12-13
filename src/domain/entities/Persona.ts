export interface Persona {
    id: string;
    name: string;
    age: number;
    occupation: string;
    educationLevel: string;
    interests: string[];
    goals: string[];
    personalityTraits: string[];
    backstory?: string;
}

export function validatePersona(entity: Persona): boolean {
    return !!entity.id;
}
