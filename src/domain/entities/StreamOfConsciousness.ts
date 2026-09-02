export interface StreamOfConsciousness {
  text: string;
  personaId: string;
  personaName: string;
}

export function validateStreamOfConsciousness(
  entity: unknown
): entity is StreamOfConsciousness {
  if (!entity || typeof entity !== "object") return false;
  const obj = entity as Record<string, unknown>;

  if (typeof obj.text !== "string" || obj.text.trim().length < 20) return false;
  if (typeof obj.personaId !== "string" || obj.personaId.trim().length === 0)
    return false;
  if (typeof obj.personaName !== "string" || obj.personaName.trim().length === 0)
    return false;

  return true;
}
