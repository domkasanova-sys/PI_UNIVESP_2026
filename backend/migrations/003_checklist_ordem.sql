ALTER TABLE checklist_itens
ADD COLUMN IF NOT EXISTS ordem INTEGER;

UPDATE checklist_itens
SET ordem = id
WHERE ordem IS NULL;

ALTER TABLE checklist_itens
ALTER COLUMN ordem SET DEFAULT 0,
ALTER COLUMN ordem SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_itens_ativo_ordem
ON checklist_itens (ativo, ordem, id);
