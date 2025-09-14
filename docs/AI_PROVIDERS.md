# AI Provider Configuration

## Overview
The system now supports multiple AI providers with easy switching via environment variables.

## Available Providers

### 1. Gemini (Google)
- **Model**: `gemini-1.5-flash`
- **Free Tier**: 15 requests/minute, 1.500 requests/day
- **Cost**: $0.075/1M input tokens, $0.30/1M output tokens
- **Quality**: Excellent for event analysis

### 2. Groq (Llama)
- **Model**: `llama-3.1-70b-versatile`
- **Free Tier**: 6.000 tokens/minute
- **Cost**: Free for moderate usage
- **Quality**: Very good, extremely fast responses

## Configuration

### Environment Variables
Add to your `.env` file:

```env
# Choose provider: gemini or groq
AI_PROVIDER=gemini

# API Keys (add the ones you need)
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

### Switching Providers
Simply change the `AI_PROVIDER` variable:

```env
# Use Gemini (default)
AI_PROVIDER=gemini

# Use Groq (free alternative)
AI_PROVIDER=groq
```

## Getting API Keys

### Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy and paste into `GEMINI_API_KEY`

### Groq API Key
1. Go to [Groq Console](https://console.groq.com/)
2. Sign up for free account
3. Create API key in settings
4. Copy and paste into `GROQ_API_KEY`

## Provider Features Comparison

| Feature | Gemini | Groq |
|---------|--------|------|
| **Free Tier** | Limited (1.5K/day) | Generous (6K tokens/min) |
| **Speed** | Fast | Extremely Fast |
| **Quality** | Excellent | Very Good |
| **Structured Output** | Great | Good |
| **Context Length** | 1M tokens | 32K tokens |
| **Cost (Paid)** | $0.075-0.30/1M | Free for most usage |

## Troubleshooting

### Provider Not Working
1. Check API key is valid
2. Verify environment variable is set correctly
3. Check quota/rate limits

### Switching Issues
1. Restart the application after changing `AI_PROVIDER`
2. Ensure the new provider's API key is configured
3. Check logs for specific error messages

## Recommendation

- **Development**: Use Groq (free and fast)
- **Production**: Use Gemini (highest quality)
- **Budget-conscious**: Use Groq (free tier generous)

The system automatically handles the differences between providers, so switching is seamless.