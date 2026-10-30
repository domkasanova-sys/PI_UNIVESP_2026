ALTER TABLE funcionarios
ADD COLUMN IF NOT EXISTS foto_perfil BYTEA;

ALTER TABLE funcionarios
ADD COLUMN IF NOT EXISTS foto_perfil_atualizada_em TIMESTAMPTZ;
