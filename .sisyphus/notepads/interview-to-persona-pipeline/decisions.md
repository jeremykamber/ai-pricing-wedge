1: # Decisions - Interview to Persona Pipeline
2:
3: - IdRagStore uses a single generic `Chunk` interface with a discriminant `chunkType` to represent both backstory and interview fragments.
4: - The `BackstoryChunk` concrete type was deleted and its shape migrated into `Chunk` with metadata keys `topic`, `emotionalTone`, and `relatedChunkIds`.
5: - Chunking logic should be extracted to standalone exported functions (`chunkBackstory`) to allow reuse outside the class and to simplify testing.
6: - The previous private `chunkBackstory` method in `IdRagStore` was left behind during refactor; it has been removed to avoid duplicate implementations.
