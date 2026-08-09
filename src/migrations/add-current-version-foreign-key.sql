ALTER TABLE assistants
ADD CONSTRAINT assistants_current_version_id_fkey
FOREIGN KEY (current_version_id)
REFERENCES assistant_versions(id);