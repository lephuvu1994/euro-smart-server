# 1. Voice to AI Control Flow

This document details the exact lifecycle of a voice command originating from the end-user's mobile app and ending up as a physical action in their smart home, driven by the Sensa-Smart AI backend.

## 🔄 End-to-End Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant App as Mobile App
    participant CoreAPI as /v1/app/ai/chat
    participant AiService
    participant MCP as MCP Server
    participant BullMQ
    participant Worker

    User->>App: "Tắt đèn phòng khách" (Voice)
    App->>App: Speech-to-Text (STT) processing
    App->>CoreAPI: POST { prompt: "Tắt đèn phòng khách" }
    Note over CoreAPI: AuthGuard validates JWT & gets `userId`

    CoreAPI->>AiService: userChatStream(prompt, userId)
    Note over AiService: Intercepts connection.<br/>Instructs Gemini: "You serve User ID: <userId>."
    AiService->>Gemini: Stream prompt + injected system instruction

    Gemini-->>AiService: functionCall "set_device_entity_value" (token, value)
    Note over AiService: 🛡 INJECTION FILTER <br/> AiService force-appends `userId` to arguments
    AiService->>MCP: callTool("set_device_entity_value", { token, value, userId })

    Note over MCP: Validates IF device.ownerId == userId
    MCP->>BullMQ: Job "control_cmd" { token, value, source: "ai_voice" }
    MCP-->>AiService: "Action Pending/Confirmed"

    AiService->>Gemini: Tool Result
    Gemini-->>CoreAPI: "Đã tắt đèn phòng khách thành công"
    CoreAPI-->>App: Stream / Text
    App->>App: Text-to-Speech (TTS)
    App->>User: Audio Playback
```

## 🔐 Security & Context Mapping

1. **Voice Text Payload**: The payload from the App is pure text. The backend treats it as a normal prompt.
2. **The "Who am I?" Problem**: Gemini natively doesn't know who is talking. If not scoped, it might search globally.
3. **The Interceptor Solution**:
   - `AiService` wraps the user request.
   - It forcefully injects `userId: string` into every tool schema that the AI generates before evaluating it against the Database via MCP.
