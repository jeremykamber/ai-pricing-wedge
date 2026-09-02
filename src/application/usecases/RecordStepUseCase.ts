import { TestingSession } from "@/domain/entities/TestingSession";
import { InteractionStep } from "@/domain/entities/InteractionStep";
import { IMemoryServicePort } from "@/domain/ports/IMemoryServicePort";

/**
 * RecordStepUseCase
 * 
 * Appends a step to the testing session and periodically updates the short-term memory
 * to prevent context overflow in long-running analyses.
 */
export class RecordStepUseCase {
  constructor(private readonly memoryService: IMemoryServicePort) { }

  async execute(session: TestingSession, step: InteractionStep): Promise<TestingSession> {
    // 1. Append the new step to the session
    const updatedSteps = [...session.steps, step];

    let updatedMemory = session.shortTermMemory;

    // 2. Update short-term memory every 3 steps
    if (updatedSteps.length > 0 && updatedSteps.length % 3 === 0) {
      console.log(`[RecordStepUseCase] Updating short-term memory at step ${updatedSteps.length}...`);
      updatedMemory = await this.memoryService.summarizeSteps(updatedSteps);
    }

    // Return a new session object to maintain immutability if preferred by the caller,
    // although the entity itself is just an interface.
    return {
      ...session,
      steps: updatedSteps,
      shortTermMemory: updatedMemory
    };
  }
}
