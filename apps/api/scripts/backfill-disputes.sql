-- Backfill disputes: Find deals where both parties voted differently but status is not Disputed
-- Run this directly against your PostgreSQL database

-- First, see which deals have vote mismatches but are still Active
SELECT 
    d.on_chain_id,
    d.status,
    v1.party as party_a_voter,
    v1.outcome as party_a_outcome,
    v2.party as party_b_voter,
    v2.outcome as party_b_outcome
FROM deals d
JOIN votes v1 ON v1.on_chain_id = d.on_chain_id AND LOWER(v1.party) = LOWER(d.party_a)
JOIN votes v2 ON v2.on_chain_id = d.on_chain_id AND LOWER(v2.party) = LOWER(d.party_b)
WHERE 
    d.status = 'Active'
    AND v1.outcome != v2.outcome;

-- Update these deals to Disputed status
UPDATE deals d
SET status = 'Disputed', updated_at = NOW()
WHERE d.on_chain_id IN (
    SELECT d2.on_chain_id
    FROM deals d2
    JOIN votes v1 ON v1.on_chain_id = d2.on_chain_id AND LOWER(v1.party) = LOWER(d2.party_a)
    JOIN votes v2 ON v2.on_chain_id = d2.on_chain_id AND LOWER(v2.party) = LOWER(d2.party_b)
    WHERE d2.status = 'Active' AND v1.outcome != v2.outcome
);

-- Check current deal statuses
SELECT on_chain_id, status, party_a, party_b FROM deals ORDER BY on_chain_id DESC LIMIT 10;