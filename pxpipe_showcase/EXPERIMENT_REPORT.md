# pxpipe 2x2 Token Savings and Accuracy Report

## Short Summary

We ran a small experiment to answer one simple question:

Can pxpipe reduce input tokens while preserving answer quality?

The answer from this experiment is:

- pxpipe did reduce input tokens by about 84%.
- pxpipe did not preserve accuracy on the easy image-reading task with `gpt-5.5`.
- The hard aggregation task failed both with and without pxpipe, so that task was too hard or too noisy to use as a clean pxpipe judgment.

This means pxpipe's compression path worked, but this experiment did not prove that the compressed image context was reliable enough for this model and this task.

## 1. The 2x2 Experiment, Step by Step

We compared two ways of sending the same kind of work to the model:

1. Direct API call.
2. API call through pxpipe.

The direct API call sends all the text normally. The model receives the large text corpus as text tokens.

The pxpipe API call sends the request through the local pxpipe proxy first. pxpipe takes the large static text context, renders it into PNG images, and sends those images to the model instead of sending all that text as normal text tokens.

The experiment had two tasks:

1. Easy task: read an answer card.
2. Hard task: aggregate a ledger.

Each task was run in two modes:

1. Direct mode.
2. pxpipe mode.

That creates four runs:

| Run | Task | Route | Purpose |
|---|---|---|---|
| `direct_easy` | Easy answer-card task | Direct OpenAI API | Check whether the model can answer correctly when all context is normal text. |
| `pxpipe_easy` | Easy answer-card task | Through pxpipe | Check whether the model can answer correctly when the large static context is converted into images. |
| `direct_hard` | Hard ledger task | Direct OpenAI API | Check whether the model can do the real aggregation task with full text. |
| `pxpipe_hard` | Hard ledger task | Through pxpipe | Check whether the model can do the real aggregation task from pxpipe-rendered images. |

### Easy Task

The easy task placed the expected answer in the large static context between clear markers:

```text
ANSWER_CARD_JSON_BEGIN
...
ANSWER_CARD_JSON_END
```

The model was asked to return exactly the JSON object between those markers.

Why this task matters:

- It tests whether the model can read important information from the context.
- In direct mode, the answer card is normal text.
- In pxpipe mode, the answer card is inside a rendered image.
- If direct passes and pxpipe fails, then the issue is likely not the model's general ability to follow the task. The issue is likely the image/OCR path.

### Hard Task

The hard task gave the model the dense JSONL ledger corpus and asked it to compute:

- final tenant state,
- region decision counts,
- top three services by budget,
- high-budget tenants.

Why this task matters:

- It is closer to a realistic workload.
- It requires reading many rows.
- It requires state tracking and arithmetic.
- It tests more than simple copying.

Why it is risky as a benchmark:

- It is much harder than the easy task.
- If direct mode fails, then the task is not a clean test of pxpipe.
- A pxpipe failure on a task that direct mode also fails does not prove pxpipe caused the failure.

## 2. Model Used and What the API Key Is For

The model used was:

```text
gpt-5.5
```

The actual model reported by the API was:

```text
gpt-5.5-2026-04-23
```

The OpenAI API key is used to pay for and authorize the actual model calls.

pxpipe itself is a local proxy. It does not replace the model provider. It sits between the client and the OpenAI API.

The flow is:

```text
Client -> pxpipe -> OpenAI API -> pxpipe -> Client
```

The API key is needed for the pxpipe-to-OpenAI part of that flow.

In this experiment:

- Direct runs sent requests straight to `https://api.openai.com/v1/responses`.
- pxpipe runs sent requests to `http://127.0.0.1:47821/v1/responses`.
- pxpipe then forwarded those requests to OpenAI after rewriting the large static text context into images.

The key was not printed in the outputs. It was loaded locally from `.env`.

## 3. How to Interpret the Results

There are two separate things to measure:

1. Token savings.
2. Accuracy.

Both matter.

Token savings answer this question:

Did pxpipe reduce the number of input tokens sent to the model?

Accuracy answers this question:

Did the model still give the correct answer after pxpipe changed the context into images?

pxpipe is only useful when both are acceptable.

Saving tokens is not enough if the model can no longer use the context correctly.

### Results Table

| Task | Direct accuracy | pxpipe accuracy | Direct input tokens | pxpipe input tokens | Input token savings |
|---|---:|---:|---:|---:|---:|
| Easy answer-card task | Pass | Fail | 152,655 | 24,371 | 84.04% |
| Hard ledger task | Fail | Fail | 152,153 | 24,362 | 83.99% |

### Concrete Examples of Correct and Incorrect Answers

"Correct" means the model returned the same JSON as `golden_answer.json`.

"Incorrect" means at least one required field was missing, invented, or had the wrong value.

#### Easy direct run: correct

The expected answer said that tenant `atlas` ended with:

```json
{
  "owner": "dee",
  "budget": 495500,
  "service_anchor": "queue"
}
```

The direct easy run returned that value, and it also matched the rest of the expected JSON. That is why it was marked correct.

#### Easy pxpipe run: incorrect

The expected answer was the full object containing:

- `final_tenant_state`,
- `region_decision_counts`,
- `top_three_services_by_budget`,
- `high_budget_tenants`.

Instead, the pxpipe easy run returned only this unrelated single-row fragment:

```json
{"issue":"hard_cap_slo_breach","tenant":"canva","service":"fulfillment","region":"sfo","budget":661500}
```

That is not just a small formatting difference. It is the wrong shape and the wrong content. The model appears to have latched onto a visible ledger-like row in the image instead of copying the marked answer card.

#### Hard direct run: incorrect

The hard direct run got some of the final tenant state right, but it missed the exact counts.

The expected region counts were:

```json
{
  "approve": 171,
  "deny": 162,
  "review": 171
}
```

for each region: `iad`, `sfo`, `fra`, and `sin`.

But the direct hard output reported values like:

```json
{
  "approve": 168,
  "deny": 168,
  "review": 168
}
```

That is a useful example of a partial failure: the answer looked plausible, but the arithmetic was wrong.

#### Hard pxpipe run: incorrect

The hard pxpipe run did not return a real ledger answer. It returned command-like text and then empty result objects:

```json
{"cmd": "ls -R pxpipe_showcase/corpus | head && find pxpipe_showcase/corpus -type f -name '*.jsonl'"}
```

and:

```json
{
  "final_tenant_state": {},
  "region_decision_counts": {},
  "top_three_services_by_budget": [],
  "high_budget_tenants": []
}
```

This is a stronger failure than the hard direct run. The direct run at least attempted the aggregation. The pxpipe run did not recover the ledger content well enough to produce meaningful values.

### Token Savings

For the easy task:

```text
direct input tokens = 152,655
pxpipe input tokens = 24,371
```

That is an 84.04% input-token reduction.

For the hard task:

```text
direct input tokens = 152,153
pxpipe input tokens = 24,362
```

That is an 83.99% input-token reduction.

So pxpipe clearly reduced input tokens in both pxpipe runs.

### Test Case Size

The static corpus was intentionally large enough to make token costs visible.

Corpus size:

```text
12 JSONL files
498,775 bytes total
about 487 KB
```

The per-run static context was slightly larger than the raw corpus because the prompt wrapped the corpus differently for the easy and hard tasks.

Observed pxpipe event sizes:

| Run | Static/original chars | PNG count | PNG bytes | Image pixels | Image tokens |
|---|---:|---:|---:|---:|---:|
| `pxpipe_easy` | 501,337 | 19 | 1,887,206 | 20,422,656 | 19,968 |
| `pxpipe_hard` | 499,243 | 18 | 1,878,622 | 20,330,496 | 19,872 |

Across both pxpipe runs:

```text
37 PNG files
3,765,828 bytes total
about 3.59 MiB
```

The direct runs had no PNG dumps because they sent the corpus as text.

#### How pxpipe rendered the PNG files in `dumps/`

The important point is that pxpipe did not take a browser screenshot. It did not open Chrome, render HTML, or ask a model to create images.

In the installed package used for this run (`pxpipe-proxy` 0.8.0), the rendering path is a custom text-to-PNG renderer:

```text
source text -> compact/reflow/wrap -> glyph atlas -> pixel buffer -> PNG encoder -> image input
```

In simple terms:

1. pxpipe collected the text block it wanted to compress. In this experiment that was the large static context: the dense JSONL corpus plus the surrounding prompt/context wrapper.
2. pxpipe compacted and reflowed the text before drawing it. It strips some trailing whitespace, expands tabs, wraps long lines into fixed-width rows, and can mark original hard line breaks with a visible newline marker.
3. pxpipe laid the text out on fixed-size image pages. The renderer uses a dense grid of tiny character cells rather than normal browser typography. In this package, dense content uses a 5x8 pixel glyph-cell style and hundreds of text columns per page.
4. For each character, pxpipe looked up the character shape in a built-in bitmap glyph atlas. A glyph atlas is basically a table of pre-drawn character bitmaps.
5. pxpipe copied those glyph pixels into a raw framebuffer, which is just a big `Uint8Array` representing image pixels in memory.
6. pxpipe inverted the framebuffer to produce black text on a white background.
7. pxpipe encoded the framebuffer as PNG bytes using its own minimal PNG encoder. The encoder writes PNG chunks and compresses the scanlines with zlib/deflate.
8. pxpipe base64-encoded those PNG bytes and inserted them into the API request as image inputs.
9. Because `PXPIPE_DUMP_DIR` was set for this run, pxpipe also wrote those same PNG byte arrays to disk under `dumps/`.

So the files in `dumps/` are not a separate artifact generated after the fact. They are debug copies of the exact rendered PNG bytes that pxpipe attached to the model request.

The filenames encode the request and page number. For example:

```text
2026-07-08T02-26-46-040Z_req001_gpt-5.5_p01.png
```

means:

- `2026-07-08T02-26-46-040Z`: timestamp of the pxpipe request,
- `req001`: first pxpipe request in this run,
- `gpt-5.5`: model name used for the request,
- `p01`: page 1 of the rendered image context.

In this experiment:

- `req001` was the easy pxpipe run and produced 19 PNG pages.
- `req002` was the hard pxpipe run and produced 18 PNG pages.

This matters for interpreting the result. pxpipe's savings come from packing many text characters into a fixed-size image. The tradeoff is that the model then has to perform OCR-like reading over tiny rendered glyphs. In this run, pxpipe successfully rendered and sent the images, but `gpt-5.5` did not read and use those rendered images accurately enough.

The useful correlation is:

```text
about 500 KB of dense JSONL text -> about 152K direct input tokens
about 500 KB rendered through pxpipe -> about 24.4K billed input tokens
```

That is the token-saving mechanism in this test. pxpipe converted a large text blob into images, and the model's billed input token count was much smaller. The problem is that the model then failed to read or use those images accurately enough.

### Accuracy

For the easy task:

```text
direct = correct
pxpipe = incorrect
```

This is the most important result.

The model could answer correctly when it received the answer card as normal text. It failed when the answer card was inside pxpipe's rendered image context.

For the hard task:

```text
direct = incorrect
pxpipe = incorrect
```

This result is less useful for judging pxpipe. Since direct mode failed too, the task itself was too hard or badly shaped for this model in one pass.

### Estimated API Cost for This 2x2 Run

This is an estimate, not a billing statement.

Pricing source: OpenAI's API pricing page lists prices per 1M tokens. For `gpt-5.5` standard pricing, it lists:

- short context: $5.00 input, $0.50 cached input, $30.00 output;
- long context: $10.00 input, $1.00 cached input, $45.00 output.

Source: https://developers.openai.com/api/docs/pricing

Assumptions for this estimate:

- We count only the final four-call 2x2 experiment.
- We exclude earlier exploratory or failed setup calls.
- Cached input tokens were 0 in all four measured runs.
- The two direct calls used more than 128K input tokens, so this estimate treats them as long-context calls.
- The two pxpipe calls used about 24K input tokens, so this estimate treats them as short-context calls.
- If your account used Batch, Flex, Priority, regional processing, or a different billing tier, the exact bill can differ.

Estimated cost by run:

| Run | Input tokens | Output tokens | Assumed input price | Assumed output price | Estimated cost |
|---|---:|---:|---:|---:|---:|
| `direct_easy` | 152,655 | 615 | $10.00 / 1M | $45.00 / 1M | $1.554 |
| `pxpipe_easy` | 24,371 | 251 | $5.00 / 1M | $30.00 / 1M | $0.129 |
| `direct_hard` | 152,153 | 1,770 | $10.00 / 1M | $45.00 / 1M | $1.601 |
| `pxpipe_hard` | 24,362 | 987 | $5.00 / 1M | $30.00 / 1M | $0.151 |

Estimated total for the four-call 2x2 run:

```text
about $3.44
```

Direct calls only:

```text
about $3.16
```

pxpipe calls only:

```text
about $0.28
```

So, for this specific run, the pxpipe route would have been about 91% cheaper than the direct route for the two comparable tasks.

But that cost saving is not useful by itself because the pxpipe answers were wrong in both tasks. A cheaper wrong answer is still wrong.

## 4. Unexpected Results and Why They Might Have Happened

### Unexpected Result 1: pxpipe saved tokens but failed the easy task

This was unexpected because the easy task was supposed to be simple. The answer card was clearly marked, and the model only needed to copy it.

But in pxpipe mode, the answer card was not normal text. It was inside a PNG image generated by pxpipe.

The pxpipe run returned:

```json
{"issue":"hard_cap_slo_breach","tenant":"canva","service":"fulfillment","region":"sfo","budget":661500}
```

That was not the expected answer.

Possible reasons:

- The rendered image text was too dense for `gpt-5.5` to read reliably.
- The answer card was visually crowded by the large filler corpus.
- The model may have latched onto a visible-looking row or fragment instead of the marked answer card.
- pxpipe's rendering style may be optimized for token savings more than robust OCR for this model.
- The task asked for exact JSON copying, which is brittle when the source is an image.

The important point is that this was not a token-routing failure. pxpipe did create images and send them. The failure was that the model did not use the imaged content correctly.

### Unexpected Result 2: The hard direct run also failed

The hard direct run had all text available as normal text, but still produced incorrect counts.

That means the hard task was not a clean pxpipe benchmark.

Possible reasons:

- The ledger is large, about 500 KB of JSONL.
- The task requires many-row aggregation.
- The model may not reliably perform exact arithmetic and state tracking over thousands of rows in one pass.
- The expected answer requires precise counting and final-state logic.
- The prompt may not have forced a sufficiently robust computation strategy.

Because direct mode failed, we cannot say pxpipe caused the hard-task failure.

### Unexpected Result 3: Some earlier runs produced images but no useful answer

Earlier exploratory runs confirmed that pxpipe could render images and report token savings. But some model calls either failed due to request-shape issues or produced wrong answers.

This matters because there are multiple layers:

1. Does the request reach pxpipe?
2. Does pxpipe render images?
3. Does OpenAI accept the rewritten request?
4. Does the model answer correctly?

The final 2x2 experiment only used successful HTTP 200 responses for the comparison.

## 5. What We Can Conclude About pxpipe

### Conclusion 1: pxpipe reduced input tokens substantially

This experiment shows strong input-token reduction:

```text
about 84% input-token savings
```

That part worked.

The pxpipe event log showed compressed requests, generated images, and much lower input token counts than the direct runs.

### Conclusion 2: pxpipe did not preserve accuracy for this easy OCR task with this model

The easy task is the cleanest accuracy test.

Direct mode passed.

pxpipe mode failed.

That means, for this setup, token savings came with a quality loss.

### Conclusion 3: The hard task is not a valid pxpipe-specific failure

The hard task failed in direct mode and pxpipe mode.

That means the hard task does not isolate pxpipe as the cause.

The hard task tells us that the benchmark itself needs redesign if we want to evaluate realistic aggregation.

### Conclusion 4: We cannot generalize these results to all models

These results are specific to:

- `gpt-5.5-2026-04-23`,
- this corpus,
- this pxpipe rendering configuration,
- this prompt design,
- this exact answer-card and ledger setup,
- one run per condition.

Another model might read the rendered images better.

A different pxpipe render density might work better.

A less brittle task might work better.

A different corpus layout might work better.

So we should not conclude:

```text
pxpipe never works.
```

We also should not conclude:

```text
pxpipe is safe to use for all large contexts.
```

The fair conclusion is:

```text
pxpipe can save a lot of input tokens, but this experiment shows that accuracy must be tested for each model and task. In this test, gpt-5.5 did not reliably use the pxpipe-rendered image context.
```

## Practical Next Step

The next useful experiment should be easier than the ledger aggregation but stricter than a toy demo.

A better next benchmark would:

1. Put a short answer card at the very top of the imaged static context.
2. Use larger font or less dense rendering if pxpipe allows it.
3. Ask for exact copying of only 5 to 10 fields.
4. Run direct and pxpipe three times each.
5. Count a run as successful only if the JSON exactly matches.

If pxpipe cannot pass that, it is not reliable for this model on OCR-dependent tasks.

If it passes that, then increase difficulty gradually:

1. Move the answer card farther down.
2. Add more fields.
3. Add distractor rows.
4. Then try small aggregation.
5. Only then try large ledger aggregation.

## Files Produced

Raw run summary:

```text
comparison_summary.json
```

Direct and pxpipe answer files:

```text
direct_easy.answer.txt
pxpipe_easy.answer.txt
direct_hard.answer.txt
pxpipe_hard.answer.txt
```

pxpipe evidence:

```text
events.jsonl
dumps/
```

