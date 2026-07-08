# pxpipe Token Savings Showcase

This is a model-agnostic pxpipe test case. It works best with any model that can read dense text rendered as images well enough for state tracking and aggregate recall.

## Why this case is good

- The corpus is dense JSONL, which is where image context can beat plain text tokens.
- The task asks for final state and aggregates, which are useful model behaviors to test.
- It avoids exact hashes, IDs, and secrets because dense image reads are not byte-exact.
- The expected answer is in `golden_answer.json`, so you can grade correctness separately from token savings.

## Run the A/B

Plain control:

```bash
# Use your normal model/client with no proxy.
# Ask it to read pxpipe_showcase/corpus and answer using pxpipe_showcase/test_prompt.md.
```

pxpipe arm:

Create a `.env` file in the workspace root:

```bash
PXPIPE_MODELS="gpt-5.5,gpt-5.6"
ANTHROPIC_BASE_URL="http://127.0.0.1:47821"
OPENAI_BASE_URL="http://127.0.0.1:47821/v1"
PXPIPE_DUMP_DIR="./pxpipe_showcase/dumps"
PXPIPE_LOG="./pxpipe_showcase/events.jsonl"
```

Load it in Git Bash before starting the proxy or client:

```bash
set -a
source .env
set +a
```

Then run the proxy in Terminal 1:

```bash
pxpipe
```

In Terminal 2, load the same `.env` file and run one client path:

```bash
set -a
source .env
set +a

# Anthropic-style clients:
claude

# OpenAI-compatible clients should use OPENAI_BASE_URL from .env.
```

Then give the model the contents of `pxpipe_showcase/test_prompt.md` after asking it to read `pxpipe_showcase/corpus`. To print the prompt locally:

```bash
cat ./pxpipe_showcase/test_prompt.md
```

## What to measure

Open the dashboard at http://127.0.0.1:47821/ and compare the recorded baseline input against actual input. The useful claim is not a universal dollar number; it is whether the same answer matches `golden_answer.json` while the request input shrinks.

For GPT/OpenAI-compatible traffic, the proxy can use image-token accounting for imaged blocks. For Anthropic traffic, pxpipe also records a text-only count_tokens counterfactual when the upstream supports it.

After the run, verify that traffic reached the proxy:

```bash
ls -lh ./pxpipe_showcase/events.jsonl
ls -lh ./pxpipe_showcase/dumps
```
