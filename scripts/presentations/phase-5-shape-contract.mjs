// Read-only generator. Paste output into the Phase 5 SQL contract via a reviewed patch.
import { z } from 'zod';
import { loadSource } from '../../tests/presentations/load-source.mjs';
const { advancedContents } = await loadSource(new URL('../../src/lib/presentations/advanced-families.ts', import.meta.url));
export const phase5ShapeContract = z.toJSONSchema(z.object(advancedContents), { unrepresentable: 'any', reused: 'ref', io: 'input' });
if (process.argv[1]?.endsWith('phase-5-shape-contract.mjs')) console.log(JSON.stringify(phase5ShapeContract));
