"""Commercial-safe TRELLIS.2-4B image-to-3D worker for OCG 3D ENGINE.

Refuses non-commercial dependencies (briaai/RMBG-2.0, nvdiffrast, nvdiffrec)
unless explicitly licensed, verifies CUDA + locally cached weights, and
never fakes inference when GPU or model weights are unavailable.
"""

import json
import os
import shutil
import sys
import tempfile

APPROVED_BG_REMOVERS = {"u2net", "isnet-general-use"}
RESTRICTED_COMPONENTS = {"briaai/RMBG-2.0", "nvdiffrast", "nvdiffrec"}


def fail(code: str, message: str, exit_code: int = 1) -> None:
    sys.stderr.write(json.dumps({"ok": False, "error": code, "message": message}) + "\n")
    sys.exit(exit_code)


def validate_commercial_env() -> str:
    bg_remover = os.environ.get("OCG_BG_REMOVER", "u2net").strip()
    bria_ok = os.environ.get("OCG_BRIA_COMMERCIAL_LICENSED", "").lower() == "true"
    nvdiff_ok = os.environ.get("OCG_NVDIFFRAST_COMMERCIAL_LICENSED", "").lower() == "true"

    if bg_remover == "briaai/RMBG-2.0" and not bria_ok:
        fail("NONCOMMERCIAL_DEPENDENCY_BLOCKED", "briaai/RMBG-2.0 is blocked in commercial mode.")
    if bg_remover not in APPROVED_BG_REMOVERS and not (bg_remover == "briaai/RMBG-2.0" and bria_ok):
        fail("UNAPPROVED_BG_REMOVER", f"Unsupported background remover: {bg_remover}")

    if not nvdiff_ok:
        for mod_name in ("nvdiffrast", "nvdiffrec"):
            if mod_name in sys.modules:
                fail("NONCOMMERCIAL_DEPENDENCY_BLOCKED", f"{mod_name} is blocked in commercial mode.")

    if os.environ.get("OCG_DINOV3_ATTRIBUTION", "").strip() != "Built with DINOv3":
        fail("ATTRIBUTION_REQUIRED", "OCG_DINOV3_ATTRIBUTION must be set to 'Built with DINOv3'.")

    return bg_remover


def main() -> None:
    if len(sys.argv) < 3:
        fail("INVALID_ARGS", "Usage: trellis2_worker.py <input_image_path> <output_glb_path>", 2)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    bg_remover = validate_commercial_env()

    try:
        import torch  # type: ignore
    except ImportError:
        fail("TORCH_UNAVAILABLE", "PyTorch with CUDA is not installed on this host.")

    if not torch.cuda.is_available():
        fail("GPU_UNAVAILABLE", "NVIDIA CUDA GPU is required for TRELLIS.2-4B inference.")

    cache_dir = os.environ.get("OCG_TRELLIS_LOCAL_CACHE_DIR", "").strip()
    if not cache_dir or not os.path.isdir(cache_dir):
        fail("WEIGHTS_NOT_CACHED", "OCG_TRELLIS_LOCAL_CACHE_DIR must point to locally cached TRELLIS.2-4B weights.")

    tmp_dir = tempfile.mkdtemp(prefix="ocg-trellis2-")
    try:
        from PIL import Image  # type: ignore
        from rembg import remove, new_session  # type: ignore

        with Image.open(input_path) as img:
            rgba = remove(img.convert("RGBA"), session=new_session(bg_remover))
            prepped_path = os.path.join(tmp_dir, "input_rgba.png")
            rgba.save(prepped_path, format="PNG")

        # Load local cached TRELLIS.2 pipeline without network weight downloads
        from trellis2.pipelines import Trellis2ImageTo3DPipeline  # type: ignore

        pipe = Trellis2ImageTo3DPipeline.from_pretrained(cache_dir, local_files_only=True)
        pipe.cuda()
        outputs = pipe.run(Image.open(prepped_path))
        mesh = outputs[0]
        mesh.export(output_path)
        sys.stdout.write(json.dumps({"ok": True, "bgRemover": bg_remover, "outputPath": output_path}) + "\n")
    except Exception as exc:
        fail("INFERENCE_FAILED", str(exc))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
