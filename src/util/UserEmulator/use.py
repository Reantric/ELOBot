import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

def generate_text(prompt):
    config = {
        "model_path": "./src/util/UserEmulator/checkpoint-38000",  # Adjust path if needed
        "desired_new_tokens": 60,             # Number of tokens you want to generate
    }

    # Load tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(config["model_path"])
    model = AutoModelForCausalLM.from_pretrained(config["model_path"])
    model.eval()

    # Move model to GPU if available
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model.to(device)

    # Encode the input prompt
    inputs = tokenizer(prompt, return_tensors='pt', truncation=True, max_length=400).to(device)
    input_length = inputs['input_ids'].shape[1]
    generation_max_length = input_length + config["desired_new_tokens"]

    # Generate response with dynamic max_length
    with torch.no_grad():
        output_ids = model.generate(
            inputs['input_ids'],
            attention_mask=inputs['attention_mask'],
            max_length=generation_max_length,  # prompt length + new tokens
            num_return_sequences=1,
            temperature=0.5,
            top_k=100,
            top_p=1.0,
            repetition_penalty=1.2,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    # Extract only the newly generated tokens
    new_tokens = output_ids[0][input_length:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True)

if __name__ == "__main__":
    input_text = " ".join(sys.argv[1:])  # Combine CLI args into one prompt string
    output = generate_text(input_text)
    print(output)
