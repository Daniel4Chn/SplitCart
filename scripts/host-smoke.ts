// M7 A-REL-1/A-DB-3: synthetic OCR/finalization, then verify persistence after a host restart.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { candidateDraft } from '../src/domain/review';
const r = await import('../src/server/receipts');
const images = await import('../src/server/images');
const { pool } = await import('../src/server/db');
const proofPath = resolve('.data/host-smoke.json');
const proofSchema = z.object({ owner: z.uuid(), receipt: z.uuid(), finalization: z.uuid() }).strict();
async function removeOwner(owner: string) {
  const receipts = await pool.query('SELECT r.id,r.version FROM receipts r JOIN households h ON h.id=r.household_id WHERE h.owner_user_id=$1', [owner]);
  for (const row of receipts.rows) await images.deleteReceipt(owner, row.id, row.version);
  await pool.query('DELETE FROM participants WHERE household_id IN (SELECT id FROM households WHERE owner_user_id=$1)', [owner]);
  await pool.query('DELETE FROM households WHERE owner_user_id=$1', [owner]);
  await pool.query('DELETE FROM storage_deletions WHERE owner_user_id=$1', [owner]);
  await pool.query('DELETE FROM users WHERE id=$1 AND provider=$2', [owner, 'deployment-check']);
}
try {
  if (process.argv[2] === 'create') {
    const owner = await r.ensureOwner('deployment-check', randomUUID());
    try {
      const h = await r.household(owner);
      const empty = await r.createReceipt(owner, 'Synthetic host acceptance');
      const bytes = await readFile('tests/fixtures/synthetic-receipt.png');
      const uploaded = await images.upload(owner, empty.id, empty.version, new File([bytes], 'synthetic.png', { type: 'image/png' }));
      const processed = await images.processReceipt(owner, empty.id, uploaded.version);
      const ocr = processed.processing?.result;
      if (!ocr || ocr.candidate.totalCents !== '600' || ocr.candidate.items.length !== 2) throw Error('Synthetic OCR contract mismatch');
      const draft = candidateDraft(processed.draft, ocr, h.participants);
      draft.payerParticipantId = h.participants[0].id;
      draft.review.confirmed = true;
      draft.adjustments.forEach(a => { a.eligibilityConfirmed = true; });
      if (draft.review.lineResolutions.some(l => l.resolution === 'unsupported')) throw Error('Synthetic review contains unresolved lines');
      const saved = await r.saveDraft(owner, empty.id, draft);
      const finalized = await r.finalize(owner, empty.id, saved.version);
      if (finalized.receipt.finalization?.totalCents !== '600') throw Error('Synthetic allocation mismatch');
      const original = await images.imageResponse(owner, empty.id, 'original');
      if (!Buffer.from(await original.arrayBuffer()).equals(bytes)) throw Error('Original evidence changed');
      await mkdir(resolve('.data'), { recursive: true, mode: 0o700 });
      await writeFile(proofPath, JSON.stringify({ owner, receipt: empty.id, finalization: finalized.receipt.finalization.id }), { flag: 'wx', mode: 0o600 });
      console.log('Hosted synthetic OCR, source review, exact 600-cent finalization, original bytes: PASS. Retained for restart check.');
    } catch (error) { await removeOwner(owner); throw error; }
  } else if (process.argv[2] === 'verify') {
    const proof = proofSchema.parse(JSON.parse(await readFile(proofPath, 'utf8')));
    const owner = await pool.query('SELECT 1 FROM users WHERE id=$1 AND provider=$2', [proof.owner, 'deployment-check']);
    if (!owner.rowCount) throw Error('Not a synthetic deployment owner');
    const receipt = await r.getReceipt(proof.owner, proof.receipt);
    if (receipt.finalization?.id !== proof.finalization || receipt.finalization?.totalCents !== '600') throw Error('Snapshot did not survive restart');
    const original = await images.imageResponse(proof.owner, proof.receipt, 'original');
    const bytes = await readFile('tests/fixtures/synthetic-receipt.png');
    if (!Buffer.from(await original.arrayBuffer()).equals(bytes)) throw Error('Image did not survive restart');
    await removeOwner(proof.owner);
    await rm(proofPath);
    console.log('Hosted restart preserved finalization ID, exact shares and private image bytes; synthetic cleanup: PASS.');
  } else throw Error('Specify create or verify; run verify only after a service restart.');
} finally { await pool.end(); }
