#!/usr/bin/env python3
import os
import sys
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# ======== CONFIG ========
OUTPUT_DIR = "./src/util/UserEmulator/checkpoint-9069"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Load tokenizer/model once
tokenizer = AutoTokenizer.from_pretrained(OUTPUT_DIR, use_fast=True)
model = AutoModelForCausalLM.from_pretrained(
    OUTPUT_DIR,
    torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
    device_map="auto" if DEVICE == "cuda" else None
).eval()

# Ensure we have a valid pad token id for generation
if tokenizer.pad_token_id is None and hasattr(tokenizer, "eos_token_id") and tokenizer.eos_token_id is not None:
    tokenizer.pad_token_id = tokenizer.eos_token_id

# Resolve EOM token id (assumes it was added during training)
EOM_ID = tokenizer.convert_tokens_to_ids("<EOM>")

@torch.no_grad()
def generate_reply(
    prompt_block: str,
    max_new_tokens: int = 64,
    temperature: float = 0.7,
    top_p: float = 0.9,
    repetition_penalty: float = 1.1
) -> str:
    inputs = tokenizer(prompt_block, return_tensors="pt").to(DEVICE)
    # Stop only on <EOM> to avoid early <|endoftext|> stops
    eos_ids = None
    if isinstance(EOM_ID, int) and EOM_ID != tokenizer.unk_token_id:
        eos_ids = EOM_ID
    output_ids = model.generate(
        **inputs,
        max_new_tokens=max_new_tokens,
        min_new_tokens=3,
        temperature=temperature,
        do_sample=False,
        top_p=top_p,
        repetition_penalty=repetition_penalty,
        pad_token_id=tokenizer.pad_token_id,
        eos_token_id=eos_ids
    )
    decoded = tokenizer.decode(output_ids[0], skip_special_tokens=False)
    # Return only the generated portion
    gen = decoded[len(prompt_block):]
    # Stop at <EOM> if present
    gen = gen.split("<EOM>")[0]
    # Strip stray end tokens
    gen = gen.replace("<|endoftext|>", "").strip()
    return gen


def read_stdin_all() -> str:
    try:
        data = sys.stdin.read()
        return data
    except Exception:
        return ""

if __name__ == "__main__":
    prompt = read_stdin_all()
    if not prompt:
        print("")
        sys.exit(0)
    reply = generate_reply(prompt)
    sys.stdout.write(reply)
    sys.stdout.flush()
