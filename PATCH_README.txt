MO patch package

Purpose:
- Patch wrangler.jsonc only
- Enable GPT explanation layer without overwriting other files

Change:
- vars.AI_ENABLED: "0" -> "1"
- keep vars.OPENAI_MODEL: "gpt-4o-mini"

How to apply:
1. Open wrangler.jsonc
2. Find:
   "vars": {
       "AI_ENABLED": "0",
       "OPENAI_MODEL": "gpt-4o-mini",
   },
3. Change only AI_ENABLED to:
   "AI_ENABLED": "1"
4. Save file
5. Deploy:
   npm run mo -- deploy

Verification:
- LINE: AI
- LINE: 解釋狀態
