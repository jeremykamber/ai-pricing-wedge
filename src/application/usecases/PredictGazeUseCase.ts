import { IGazePredictionPort } from "@/domain/ports/IGazePredictionPort";
import { Persona } from "@/domain/entities/Persona";
import { GazePoint } from "@/domain/entities/GazePoint";

export class PredictGazeUseCase {
  constructor(private gazePredictionPort: IGazePredictionPort) { }

  async execute(persona: Persona, screenshotBase64: string): Promise<GazePoint[]> {
    if (!persona) throw new Error("Persona is required");
    if (!screenshotBase64) throw new Error("Screenshot is required");

    return this.gazePredictionPort.predictGaze(persona, screenshotBase64);
  }
}
