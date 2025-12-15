-- =============================================================================
-- Phase 2 Chunk 1: Property Images, Conversations, Messages
-- NEST-CORRECT VERSION (property_claims ownership)
-- =============================================================================

-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS property_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('cover', 'album')),
    album_key TEXT,
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'followers', 'chat_unlocked', 'private')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_album_unlocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    album_key TEXT NOT NULL,
    unlocked_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, album_key)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_property_images_property
    ON property_images(property_id);

CREATE INDEX IF NOT EXISTS idx_conversations_property
    ON conversations(property_id);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
    ON conversation_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at);

-- =============================================================================
-- ENABLE RLS
-- =============================================================================

ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_album_unlocks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS: property_images
-- =============================================================================

CREATE POLICY property_images_public_read ON property_images
    FOR SELECT USING (visibility = 'public');

CREATE POLICY property_images_followers_read ON property_images
    FOR SELECT TO authenticated
    USING (visibility = 'followers');

CREATE POLICY property_images_chat_unlocked_read ON property_images
    FOR SELECT TO authenticated
    USING (
        visibility = 'chat_unlocked'
        AND EXISTS (
            SELECT 1
            FROM conversation_album_unlocks cau
            JOIN conversation_participants cp
              ON cp.conversation_id = cau.conversation_id
            WHERE cau.property_id = property_images.property_id
              AND cau.album_key = property_images.album_key
              AND cp.user_id = auth.uid()
        )
    );

CREATE POLICY property_images_owner_all ON property_images
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM property_claims pc
            WHERE pc.property_id = property_images.property_id
              AND pc.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM property_claims pc
            WHERE pc.property_id = property_images.property_id
              AND pc.user_id = auth.uid()
        )
    );

-- =============================================================================
-- RLS: conversations
-- =============================================================================

CREATE POLICY conversations_participant_read ON conversations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            WHERE cp.conversation_id = conversations.id
              AND cp.user_id = auth.uid()
        )
    );

CREATE POLICY conversations_insert ON conversations
    FOR INSERT TO authenticated
    WITH CHECK (created_by_user_id = auth.uid());

-- =============================================================================
-- RLS: conversation_participants
-- =============================================================================

CREATE POLICY participants_read ON conversation_participants
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp2
            WHERE cp2.conversation_id = conversation_participants.conversation_id
              AND cp2.user_id = auth.uid()
        )
    );

CREATE POLICY participants_insert ON conversation_participants
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = conversation_participants.conversation_id
              AND c.created_by_user_id = auth.uid()
        )
    );

-- =============================================================================
-- RLS: messages
-- =============================================================================

CREATE POLICY messages_read ON messages
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            WHERE cp.conversation_id = messages.conversation_id
              AND cp.user_id = auth.uid()
        )
    );

CREATE POLICY messages_insert ON messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM conversation_participants cp
            WHERE cp.conversation_id = messages.conversation_id
              AND cp.user_id = auth.uid()
        )
    );

-- =============================================================================
-- RLS: conversation_album_unlocks
-- =============================================================================

CREATE POLICY unlocks_read ON conversation_album_unlocks
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            WHERE cp.conversation_id = conversation_album_unlocks.conversation_id
              AND cp.user_id = auth.uid()
        )
    );

CREATE POLICY unlocks_owner_insert ON conversation_album_unlocks
    FOR INSERT TO authenticated
    WITH CHECK (
        unlocked_by_user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM property_claims pc
            WHERE pc.property_id = conversation_album_unlocks.property_id
              AND pc.user_id = auth.uid()
        )
    );

-- =============================================================================
-- TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET updated_at = now()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_message_update_conversation ON messages;

CREATE TRIGGER trg_message_update_conversation
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_updated_at();
