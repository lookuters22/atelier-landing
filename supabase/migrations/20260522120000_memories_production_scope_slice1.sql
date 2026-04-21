-- Slice 1 (V3 production memory scope): explicit `scope` + `person_id` + `archived_at` on `memories`.
-- Additive only: no CHECK constraint, no app reader/writer/selector changes in this migration.
-- New INSERTs that omit `scope` get `project` when `wedding_id` is set, else `studio` (temporary DB defaulting until Slice 3 writers set scope explicitly).

CREATE TYPE public.memory_scope AS ENUM ('project', 'person', 'studio');

ALTER TABLE public.memories
  ADD COLUMN scope public.memory_scope,
  ADD COLUMN person_id UUID NULL REFERENCES public.people (id) ON DELETE CASCADE,
  ADD COLUMN archived_at TIMESTAMPTZ NULL;

UPDATE public.memories
SET scope = CASE
  WHEN wedding_id IS NOT NULL THEN 'project'::public.memory_scope
  ELSE 'studio'::public.memory_scope
END
WHERE scope IS NULL;

ALTER TABLE public.memories
  ALTER COLUMN scope SET NOT NULL;

CREATE OR REPLACE FUNCTION public.memories_scope_default_before_insert ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope IS NULL THEN
    NEW.scope := CASE
      WHEN NEW.wedding_id IS NOT NULL THEN 'project'::public.memory_scope
      ELSE 'studio'::public.memory_scope
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memories_scope_default_before_insert ON public.memories;

CREATE TRIGGER memories_scope_default_before_insert
  BEFORE INSERT ON public.memories
  FOR EACH ROW
  EXECUTE PROCEDURE public.memories_scope_default_before_insert ();

COMMENT ON COLUMN public.memories.scope IS
  'Production memory scope: project (wedding-bound), person (contact-bound), or studio (tenant-wide).';

COMMENT ON COLUMN public.memories.person_id IS
  'When scope=person, links to people.id; otherwise NULL.';

COMMENT ON COLUMN public.memories.archived_at IS
  'Soft-archive timestamp; NULL means active.';

CREATE INDEX idx_memories_project
  ON public.memories (photographer_id, wedding_id)
  WHERE scope = 'project';

CREATE INDEX idx_memories_person
  ON public.memories (photographer_id, person_id)
  WHERE scope = 'person';

CREATE INDEX idx_memories_studio
  ON public.memories (photographer_id)
  WHERE scope = 'studio';
