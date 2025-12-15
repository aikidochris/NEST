// =============================================================================
// MOCK DATA FOR MESSAGING UI DEVELOPMENT
// This provides realistic test data without requiring the DB to be set up.
// =============================================================================

import type { ConversationSummary, Message } from "./types";

// =============================================================================
// MOCK CONVERSATIONS (4-6 across different states)
// =============================================================================

export const mockConversations: ConversationSummary[] = [
    {
        id: "conv-1",
        property_id: "prop-1",
        property_title: "42 Oak Street, NE1 4AB",
        intent_status: "open_to_talking",
        last_message: "That sounds great! Happy to chat more about the area.",
        last_message_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
        unread_count: 0,
    },
    {
        id: "conv-2",
        property_id: "prop-2",
        property_title: "15 Maple Lane, SW2 3DE",
        intent_status: "for_sale",
        last_message: "We're flexible on viewings, just let us know what works.",
        last_message_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1d ago
        unread_count: 2,
    },
    {
        id: "conv-3",
        property_id: "prop-3",
        property_title: "8 Willow Court, EC4 7PQ",
        intent_status: "for_rent",
        last_message: "The lease would be for 12 months minimum.",
        last_message_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3d ago
        unread_count: 0,
    },
    {
        id: "conv-4",
        property_id: "prop-4",
        property_title: "27 Cedar Road, N1 5TG",
        intent_status: "settled",
        last_message: "Thanks for reaching out! We love the neighborhood.",
        last_message_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1w ago
        unread_count: 0,
    },
    {
        id: "conv-5",
        property_id: "prop-5",
        property_title: "99 Test Street, XX1 1XX",
        intent_status: undefined, // Unclaimed - edge case
        last_message: "[DEV] This is an unclaimed property conversation for testing.",
        last_message_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1mo ago
        unread_count: 0,
    },
];

// =============================================================================
// MOCK MESSAGES BY CONVERSATION ID
// =============================================================================

function hoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export const mockMessagesByConversationId: Record<string, Message[]> = {
    "conv-1": [
        { id: "msg-1-1", conversation_id: "conv-1", sender: "me", body: "Hi! I noticed your home on Nest. We're looking to move to the area and love the look of your street. Do you mind if I ask a few questions?", created_at: hoursAgo(26) },
        { id: "msg-1-2", conversation_id: "conv-1", sender: "them", body: "Of course! Happy to help. We've been here for almost 8 years now.", created_at: hoursAgo(25) },
        { id: "msg-1-3", conversation_id: "conv-1", sender: "me", body: "That's wonderful. How would you describe the community feel?", created_at: hoursAgo(24) },
        { id: "msg-1-4", conversation_id: "conv-1", sender: "them", body: "Really friendly. We have a WhatsApp group for the street, and everyone looks out for each other. Kids play outside in the summer.", created_at: hoursAgo(23) },
        { id: "msg-1-5", conversation_id: "conv-1", sender: "me", body: "That sounds exactly what we're looking for. Any downsides?", created_at: hoursAgo(5) },
        { id: "msg-1-6", conversation_id: "conv-1", sender: "them", body: "Parking can be tight on weekends when there's football on. But honestly, we walk most places anyway.", created_at: hoursAgo(4) },
        { id: "msg-1-7", conversation_id: "conv-1", sender: "me", body: "Good to know! Thanks so much for being open about this.", created_at: hoursAgo(3) },
        { id: "msg-1-8", conversation_id: "conv-1", sender: "them", body: "That sounds great! Happy to chat more about the area.", created_at: hoursAgo(2) },
    ],
    "conv-2": [
        { id: "msg-2-1", conversation_id: "conv-2", sender: "me", body: "Hello, I saw your home is for sale. Would it be possible to learn more about it?", created_at: hoursAgo(48) },
        { id: "msg-2-2", conversation_id: "conv-2", sender: "them", body: "Hi there! Yes, we're selling because we're relocating for work. Happy to answer any questions.", created_at: hoursAgo(47) },
        { id: "msg-2-3", conversation_id: "conv-2", sender: "me", body: "What made you choose this home originally?", created_at: hoursAgo(46) },
        { id: "msg-2-4", conversation_id: "conv-2", sender: "them", body: "The garden was a big draw. It's south-facing and gets sun all afternoon. Perfect for summer BBQs.", created_at: hoursAgo(45) },
        { id: "msg-2-5", conversation_id: "conv-2", sender: "me", body: "Could I see some photos of the kitchen?", created_at: hoursAgo(26) },
        {
            id: "msg-2-6",
            conversation_id: "conv-2",
            sender: "them",
            body: "Sure! I can share the kitchen photos now we're chatting.",
            created_at: hoursAgo(25),
            attachments: [
                { kind: "locked_album", album_key: "kitchen", label: "Kitchen album" }
            ]
        },
        { id: "msg-2-7", conversation_id: "conv-2", sender: "me", body: "That looks great! Could I arrange a viewing sometime this week?", created_at: hoursAgo(24) },
        { id: "msg-2-8", conversation_id: "conv-2", sender: "them", body: "We're flexible on viewings, just let us know what works.", created_at: hoursAgo(23) },
    ],
    "conv-3": [
        { id: "msg-3-1", conversation_id: "conv-3", sender: "me", body: "Hi, I'm interested in renting your property. Is it still available?", created_at: hoursAgo(96) },
        { id: "msg-3-2", conversation_id: "conv-3", sender: "them", body: "Yes, it's available from next month. Are you looking for a long-term let?", created_at: hoursAgo(95) },
        { id: "msg-3-3", conversation_id: "conv-3", sender: "me", body: "Yes, I'm relocating for a new job and need somewhere stable.", created_at: hoursAgo(94) },
        { id: "msg-3-4", conversation_id: "conv-3", sender: "them", body: "The lease would be for 12 months minimum.", created_at: hoursAgo(72) },
    ],
    "conv-4": [
        { id: "msg-4-1", conversation_id: "conv-4", sender: "me", body: "Hello! I'm moving to the area soon. Any tips on local shops or cafes?", created_at: hoursAgo(200) },
        { id: "msg-4-2", conversation_id: "conv-4", sender: "them", body: "Oh there are loads! The bakery on the corner does amazing sourdough. And there's a great indie coffee place two streets over.", created_at: hoursAgo(199) },
        { id: "msg-4-3", conversation_id: "conv-4", sender: "me", body: "Perfect, that's exactly what I was hoping for. How's the community feel?", created_at: hoursAgo(198) },
        { id: "msg-4-4", conversation_id: "conv-4", sender: "them", body: "Thanks for reaching out! We love the neighborhood.", created_at: hoursAgo(168) },
    ],
    "conv-5": [
        { id: "msg-5-1", conversation_id: "conv-5", sender: "me", body: "[DEV] Testing message to unclaimed property", created_at: hoursAgo(720) },
        { id: "msg-5-2", conversation_id: "conv-5", sender: "them", body: "[DEV] This is an unclaimed property conversation for testing.", created_at: hoursAgo(719) },
    ],
};
