CREATE TABLE
    IF NOT EXISTS assistants (
        id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
        name TEXT NOT NULL,
        instructions TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE
    IF NOT EXISTS assistant_versions (
        id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
        assistant_id UUID NOT NULL REFERENCES assistants (id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        instructions TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );