## 1. Refuse the token

- [x] 1.1 `AiAppSessionScopeMiddleware` answers 401 for a LabOS member token from an AI app origin and still logs `ai_app_origin_labos_token`
- [x] 1.2 Unit tests cover Bearer, the `authToken` cookie, a LabOS origin, and an app origin with no token
- [x] 1.3 The route registration still lets app session tokens through on `/me`, `/track` and `/access-check`

## 2. Docs

- [x] 2.1 `docs/AI_APPS.md` and `docs/LABOS_AUTH.md` describe the app gate as the AI app sign-in path
- [x] 2.2 The share switch stays documented. Production env is not set in this change
