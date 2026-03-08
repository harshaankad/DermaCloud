"""
Convert PyTorch ViT model to ONNX format for Node.js inference
Run with: python scripts/convert-model-to-onnx.py
"""

import torch
import torch.nn as nn
import json
import os

# Load labels
with open('labels.json', 'r') as f:
    labels = json.load(f)
    num_classes = len(labels)

print(f"Number of classes: {num_classes}")
print(f"Classes: {labels}")

# Define Vision Transformer model architecture
# Assuming ViT-Small patch16
try:
    import timm
    print("Using timm library for ViT architecture")

    # Create model with correct architecture
    model = timm.create_model('vit_small_patch16_224', pretrained=False, num_classes=num_classes)

    # Load the trained weights
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
    print("Model loaded successfully!")

    # Create dummy input (batch_size=1, channels=3, height=224, width=224)
    dummy_input = torch.randn(1, 3, 224, 224)

    # Export to ONNX
    output_path = 'skin_condition_model.onnx'
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={
            'input': {0: 'batch_size'},
            'output': {0: 'batch_size'}
        }
    )

    print(f"\n✅ Model successfully converted to ONNX format!")
    print(f"📁 Saved to: {output_path}")
    print(f"📊 Input shape: [batch_size, 3, 224, 224]")
    print(f"📊 Output shape: [batch_size, {num_classes}]")

    # Verify the ONNX model
    import onnx
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print("\n✅ ONNX model verification passed!")

    # Test inference with ONNX Runtime
    import onnxruntime as ort
    import numpy as np

    # Create session
    session = ort.InferenceSession(output_path)

    # Test with random input
    test_input = np.random.randn(1, 3, 224, 224).astype(np.float32)
    outputs = session.run(None, {'input': test_input})

    # Get predictions
    logits = outputs[0][0]
    probabilities = np.exp(logits) / np.sum(np.exp(logits))  # Softmax

    # Get top 3 predictions
    top_3_indices = np.argsort(probabilities)[-3:][::-1]

    print("\n🧪 Test inference (random input):")
    for idx in top_3_indices:
        print(f"  {labels[idx]}: {probabilities[idx]*100:.2f}%")

    print("\n✨ Conversion complete! You can now use this model in Node.js with onnxruntime-node")

except ImportError as e:
    print(f"\n❌ Error: {e}")
    print("\n📦 Please install required packages:")
    print("   pip install torch timm onnx onnxruntime")
    print("\nIf you don't have PyTorch installed:")
    print("   pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu")
