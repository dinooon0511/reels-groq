# Reels Groq transcription gateway

Netlify function: `POST /.netlify/functions/transcribe`

Configure these **secret** Netlify environment variables in the site settings:
- `GROQ_API_KEY` — Groq API key
- `TRANSCRIBE_ACCESS_KEY` — a separate long random secret for clients

Send `Authorization: Bearer <TRANSCRIBE_ACCESS_KEY>` and JSON:
```json
{"audio_base64":"<base64 of short audio clip>","filename":"clip.mp3","language":"ru"}
```

Returns transcription with word/segment timestamps. Audio must be small (base64 under 4 MB); split/compress source video audio first. This is **not** a video editing service. Do not commit credentials or paste them into chats. The function is protected, but still needs a compatible ChatGPT integration to be callable from chat.
