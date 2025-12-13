import { Persona } from "../entities/Persona";

export interface LlmServicePort {
    generateInitialPersonas(personaDescription: string): Promise<Persona[]>;
    generatePersonaBackstory(personaDescription: string): Promise<string>;
    generatePersonaBackstory(persona: Persona): Promise<string>;
}
