import { GazePoint } from "../entities/GazePoint";
import { Persona } from "../entities/Persona";

export interface IGazePredictionPort {
  predictGaze(persona: Persona, screenshotBase64: string): Promise<GazePoint[]>;
}
