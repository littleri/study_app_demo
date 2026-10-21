/** Shared artwork for the global and chapter assistant entry state machines. */
export const aiAssistantIdleImages = {
  left: "/assets/brand/ai-assistant/idle-left-v1.png",
  right: "/assets/brand/ai-assistant/idle-right-v1.png"
} as const;

// Left-docked active states mirror these right-facing images in CSS.
export const aiAssistantActiveImages = {
  pressed: "/assets/brand/ai-assistant/pressed-v1.png",
  dragging: "/assets/brand/ai-assistant/dragging-v1.png"
} as const;

export const aiAssistantAvatarSource = "/assets/brand/ai-assistant/avatar-v1.png";
