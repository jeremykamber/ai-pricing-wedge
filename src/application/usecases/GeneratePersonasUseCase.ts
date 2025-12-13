import { Persona } from "@/domain/entities/Persona";
import { LlmServicePort } from "../../domain/ports/LlmServicePort";

export class GeneratePersonasUseCase {
    constructor(private llmService: LlmServicePort) {}
    async execute(personaDescription: string): Promise<Persona[]> {
        console.log("Executing GeneratePersonas use case");
        const personas: Persona[] =
            await this.llmService.generateInitialPersonas(personaDescription);
        await Promise.all(
            personas.map(async (persona) => {
                persona.backstory =
                    await this.llmService.generatePersonaBackstory(persona);
            }),
        );
        return personas;
    }
}
