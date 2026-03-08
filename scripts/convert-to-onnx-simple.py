"""
Simple PyTorch to ONNX converter with proper encoding
Run with: python scripts/convert-to-onnx-simple.py
"""

import sys
import os

# Force UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import torch
import torch.nn as nn
import json

print("=== PyTorch to ONNX Conversion ===\n")

# Load labels
with open('labels.json', 'r') as f:
    labels = json.load(f)
    num_classes = len(labels)

print(f"Number of classes: {num_classes}")
print(f"Classes: {labels}\n")

# Import timm for ViT architecture
try:
    import timm
    print("Loading ViT-Small model architecture...")

    # Create model
    model = timm.create_model('vit_small_patch16_224', pretrained=False, num_classes=num_classes)

    # Load weights
    checkpoint = torch.load('best_vit_small.pth', map_location='cpu')

    # Handle different checkpoint formats
    if isinstance(checkpoint, dict):
        if 'model_state_dict' in checkpoint:
            model.load_state_dict(checkpoint['model_state_dict'])
        elif 'state_dict' in checkpoint:
            model.load_state_dict(checkpoint['state_dict'])
        else:
            model.load_state_dict(checkpoint)
    else:
        model.load_state_dict(checkpoint)

    model.eval()
    print("Model loaded successfully!\n")

    # Create dummy input
    dummy_input = torch.randn(1, 3, 224, 224)

    # Export to ONNX with opset 18 (recommended)
    output_path = 'skin_condition_model.onnx'

    print("Converting to ONNX format...")
    print("This may take a few minutes...\n")

    with torch.no_grad():
        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            export_params=True,
            opset_version=18,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            verbose=False  # Disable verbose to avoid unicode issues
        )

    print(f"SUCCESS: Model converted to ONNX format!")
    print(f"Saved to: {output_path}")
    print(f"Input shape: [batch_size, 3, 224, 224]")
    print(f"Output shape: [batch_size, {num_classes}]\n")

    # Verify the ONNX model
    print("Verifying ONNX model...")
    import onnx
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print("ONNX model verification passed!\n")

    # Test inference
    print("Testing inference with ONNX Runtime...")
    import onnxruntime as ort
    import numpy as np

    session = ort.InferenceSession(output_path, providers=['CPUExecutionProvider'])
    test_input = np.random.randn(1, 3, 224, 224).astype(np.float32)
    outputs = session.run(None, {'input': test_input})

    # Get predictions
    logits = outputs[0][0]
    probabilities = np.exp(logits) / np.sum(np.exp(logits))

    # Get top 3 predictions
    top_3_indices = np.argsort(probabilities)[-3:][::-1]

    print("Test inference (random input):")
    for idx in top_3_indices:
        print(f"  {labels[idx]}: {probabilities[idx]*100:.2f}%")

    print("\n=== Conversion Complete! ===")
    print("You can now use this model in Node.js with onnxruntime-node\n")

except Exception as e:
    print(f"ERROR: {e}")
    print("\nMake sure you have installed:")
    print("  pip install torch timm onnx onnxruntime")
    import traceback
    traceback.print_exc()
